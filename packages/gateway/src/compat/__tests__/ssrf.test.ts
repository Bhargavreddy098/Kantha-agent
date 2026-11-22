import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateEndpointUrl, SsrfError } from "../ssrf";

describe("SSRF Protection", () => {
  it("rejects cloud metadata IP 169.254.169.254", async () => {
    await assert.rejects(
      async () => validateEndpointUrl("http://169.254.169.254/latest/meta-data"),
      (err: any) => err instanceof SsrfError && err.message.includes("blocked")
    );
  });

  it("rejects unspecified 0.0.0.0/8 and ::", async () => {
    await assert.rejects(
      async () => validateEndpointUrl("http://0.0.0.0:8000/v1"),
      (err: any) => err instanceof SsrfError
    );
    await assert.rejects(
      async () => validateEndpointUrl("http://[::]:8000/v1"),
      (err: any) => err instanceof SsrfError
    );
  });

  it("rejects private IPv4 networks (RFC 1918) by default", async () => {
    await assert.rejects(
      async () => validateEndpointUrl("http://10.0.0.1:8000/v1"),
      (err: any) => err instanceof SsrfError
    );
    await assert.rejects(
      async () => validateEndpointUrl("http://192.168.1.100:11434/v1"),
      (err: any) => err instanceof SsrfError
    );
    await assert.rejects(
      async () => validateEndpointUrl("http://172.16.0.5:8000/v1"),
      (err: any) => err instanceof SsrfError
    );
  });

  it("rejects IPv4-mapped IPv6 addresses targeting private/metadata ranges", async () => {
    await assert.rejects(
      async () => validateEndpointUrl("http://[::ffff:169.254.169.254]/v1"),
      (err: any) => err instanceof SsrfError
    );
    await assert.rejects(
      async () => validateEndpointUrl("http://[::ffff:10.0.0.1]/v1"),
      (err: any) => err instanceof SsrfError
    );
  });

  it("allows loopback (127.0.0.1 / localhost) only when isLocal is true", async () => {
    // Rejected when isLocal is false/omitted
    await assert.rejects(
      async () => validateEndpointUrl("http://127.0.0.1:11434/v1"),
      (err: any) => err instanceof SsrfError
    );
    await assert.rejects(
      async () => validateEndpointUrl("http://localhost:11434/v1"),
      (err: any) => err instanceof SsrfError
    );

    // Allowed when isLocal is true
    await assert.doesNotReject(async () =>
      validateEndpointUrl("http://127.0.0.1:11434/v1", { isLocal: true })
    );
    await assert.doesNotReject(async () =>
      validateEndpointUrl("http://localhost:11434/v1", { isLocal: true })
    );
  });

  it("allows private LAN IPs when allowPrivateNetwork is explicitly true", async () => {
    await assert.doesNotReject(async () =>
      validateEndpointUrl("http://192.168.1.50:8000/v1", { allowPrivateNetwork: true })
    );
  });

  it("allows valid public endpoints", async () => {
    await assert.doesNotReject(async () =>
      validateEndpointUrl("https://api.openai.com/v1")
    );
    await assert.doesNotReject(async () =>
      validateEndpointUrl("https://api.anthropic.com/v1")
    );
  });
});
