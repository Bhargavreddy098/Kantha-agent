import { describe, it } from "node:test";
import assert from "node:assert";
import { IngressFencing } from "../fencing";

describe("IngressFencing Unit Tests", () => {
  it("should validate default loopback host and origins for configured port", () => {
    const fencing = new IngressFencing({ port: 4000 });

    assert.strictEqual(fencing.isHostValid("127.0.0.1:4000"), true);
    assert.strictEqual(fencing.isHostValid("localhost:4000"), true);
    assert.strictEqual(fencing.isHostValid("evil.com:4000"), false);

    assert.strictEqual(fencing.isOriginValid("http://127.0.0.1:4000"), true);
    assert.strictEqual(fencing.isOriginValid("http://localhost:4000"), true);
    assert.strictEqual(fencing.isOriginValid("http://evil.com"), false);
    assert.strictEqual(fencing.isOriginValid("http://127.0.0.1:3000"), false); // devOriginAllowed is false
  });

  it("should allow standard Vite dev origins when devOriginAllowed is true", () => {
    const fencing = new IngressFencing({ port: 4000, devOriginAllowed: true });

    assert.strictEqual(fencing.isOriginValid("http://127.0.0.1:3000"), true);
    assert.strictEqual(fencing.isOriginValid("http://localhost:3000"), true);
    assert.strictEqual(fencing.isOriginValid("http://127.0.0.1:5173"), true);
    assert.strictEqual(fencing.isOriginValid("http://localhost:5173"), true);
    assert.strictEqual(fencing.isOriginValid("http://localhost:5174"), true);
    assert.strictEqual(fencing.isOriginValid("http://127.0.0.1:4173"), true);

    // External origins are still blocked
    assert.strictEqual(fencing.isOriginValid("http://evil.com"), false);
    assert.strictEqual(fencing.isOriginValid("https://attacker.site"), false);
  });

  it("should accept custom allowedOrigins array", () => {
    const fencing = new IngressFencing({
      port: 4000,
      allowedOrigins: ["http://custom.local:8080"],
    });

    assert.strictEqual(fencing.isOriginValid("http://custom.local:8080"), true);
    assert.strictEqual(fencing.isHostValid("custom.local:8080"), true);
    assert.strictEqual(fencing.isOriginValid("http://untrusted.local"), false);
  });
});
