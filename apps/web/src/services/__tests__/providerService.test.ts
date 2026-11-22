import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeJson } from "../providerService";

describe("safeJson defensive response parsing", () => {
  it("returns null on 204 No Content", async () => {
    const res = new Response(null, { status: 204 });
    const result = await safeJson(res);
    assert.equal(result, null);
  });

  it("parses valid JSON successfully on 200 OK", async () => {
    const res = new Response(JSON.stringify({ success: true, count: 42 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const result = await safeJson<{ success: boolean; count: number }>(res);
    assert.deepEqual(result, { success: true, count: 42 });
  });

  it("throws readable error on 200 OK with empty body", async () => {
    const res = new Response("", { status: 200 });
    await assert.rejects(
      async () => {
        await safeJson(res);
      },
      (err: any) => {
        assert.ok(err.message.includes("Unexpected empty response"));
        return true;
      }
    );
  });

  it("throws readable error on 200 OK with HTML/non-JSON body instead of raw SyntaxError", async () => {
    const htmlBody = "<!DOCTYPE html><html><body>Proxy Error</body></html>";
    const res = new Response(htmlBody, { status: 200 });
    await assert.rejects(
      async () => {
        await safeJson(res);
      },
      (err: any) => {
        assert.ok(err.message.includes("Unexpected non-JSON response"));
        return true;
      }
    );
  });

  it("extracts parsed.error on !res.ok when server returns JSON error", async () => {
    const res = new Response(
      JSON.stringify({ error: "Cannot connect to Kantha daemon on port 4000" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
    await assert.rejects(
      async () => {
        await safeJson(res);
      },
      (err: any) => {
        assert.equal(err.message, "Cannot connect to Kantha daemon on port 4000");
        return true;
      }
    );
  });

  it("truncates raw error text to 200 chars on !res.ok when server returns HTML error", async () => {
    const longHtml = "<html><body>" + "A".repeat(500) + "</body></html>";
    const res = new Response(longHtml, { status: 504 });
    await assert.rejects(
      async () => {
        await safeJson(res);
      },
      (err: any) => {
        assert.ok(err.message.length <= 200);
        return true;
      }
    );
  });
});
