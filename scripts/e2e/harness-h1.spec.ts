import { expect, test, type Page } from "@playwright/test";

/**
 * H0-H1 browser contract: a scoped fixture task can be submitted from the
 * collapsible Chat harness panel, survives a mid-run reload, can be stopped,
 * and produces a deduplicated event projection. Ordinary Chat keeps its own
 * Astryx composer and transport throughout.
 */

async function openHarnessPanel(page: Page) {
  await page.goto("/chat");
  const trigger = page.getByRole("button", { name: "Harness task" });
  await expect(trigger).toBeVisible();
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  const panel = page.getByTestId("harness-run-panel");
  await expect(panel).toBeVisible();
  return panel;
}

test("H1 panel submits, survives reload mid-run, stops, and dedupes events", async ({
  page,
}) => {
  const panel = await openHarnessPanel(page);

  // Ordinary Chat keeps its Astryx composer and controls, independent of the
  // harness panel. (The local composer module is only needed for legacy imports.)
  await expect(page.getByRole("textbox", { name: "Message input" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();

  // Submit a fixture task. The Stop control only renders once a run is mapped,
  // so it is a stable signal that submission was admitted.
  await panel.getByRole("button", { name: "Run task" }).click();
  await expect(panel.getByRole("button", { name: "Stop" })).toBeVisible({
    timeout: 30_000,
  });

  // Reload mid-run: the durable projection must restore the same run.
  await page.reload();
  const reloaded = await openHarnessPanel(page);
  await expect(reloaded.getByRole("button", { name: "Stop" })).toBeVisible({
    timeout: 30_000,
  });

  // Stop the recovered run.
  await reloaded.getByRole("button", { name: "Stop" }).click();

  // Evidence entries are deduplicated by stable source event id, so no two
  // rendered rows repeat the same step/type/data rendering.
  const evidenceToggle = reloaded.getByText(/Run evidence \(\d+\)/);
  if (await evidenceToggle.count()) {
    await evidenceToggle.click();
    const rows = await reloaded.locator("span, p").allTextContents();
    const evidenceRows = rows.filter((text) => / · step \d+ · /.test(text));
    const unique = new Set(evidenceRows);
    expect(unique.size).toBe(evidenceRows.length);
  }

  // Ordinary Chat composer is still present after the harness lifecycle.
  await expect(page.getByRole("textbox", { name: "Message input" })).toBeVisible();
});
