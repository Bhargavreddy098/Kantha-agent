import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { CatalogService, CatalogServiceLive } from "../service";
import { InMemoryPortsLayer } from "../../ports/in-memory";

describe("CatalogService", () => {
  it("loads bundled snapshot when cache is unpopulated", async () => {
    const program = Effect.gen(function* () {
      const catalogService = yield* CatalogService;
      const catalog = yield* catalogService.getCatalog();
      return catalog;
    }).pipe(
      Effect.provide(CatalogServiceLive),
      Effect.provide(InMemoryPortsLayer)
    );

    const catalog = await Effect.runPromise(program);
    assert.ok(catalog.models.length > 0);
    const claude = catalog.models.find((m) => m.id.includes("claude-3-7-sonnet"));
    assert.ok(claude);
    assert.equal(claude.tier, 1);
  });
});
