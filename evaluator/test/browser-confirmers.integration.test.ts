/**
 * Differential check of every browser confirmer against a REAL Arena: absent in baseline,
 * present in the scenario that declares the flag (H25/H26). Skipped unless SELFTEST_ARENA_URL is set.
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchClient } from "@arena/scenarios";
import { afterAll, describe, expect, it } from "vitest";
import { browserConfirmer, loadPlaywright } from "../src/browser-confirmers.ts";

const arenaUrl = process.env.SELFTEST_ARENA_URL;
const here = dirname(fileURLToPath(import.meta.url));

const CASES: Array<[flag: string, scenario: string]> = [
  ["ui.typo_messages", "fase1-login"],
  ["ui.testid_rotating", "fase1-localizadores"],
  ["ui.ambiguous_labels", "fase1-localizadores"],
  ["ui.late_loading", "fase1-compra"],
  ["ui.double_submit", "fase1-compra"],
  ["ui.state_mismatch", "fase1-aserciones"],
];

describe.skipIf(!arenaUrl)("browser confirmers (real Arena + Chromium)", () => {
  const client = fetchClient(arenaUrl!, { runnerToken: process.env.SELFTEST_ARENA_TOKEN });
  const browser = browserConfirmer(loadPlaywright(here).chromium, arenaUrl!, client);
  afterAll(() => browser.close());

  async function check(scenario: string, flag: string) {
    await client.setScenario(scenario);
    await client.reset();
    const [r] = await browser.confirm([flag]);
    await client.reset();
    return r!;
  }

  it.each(CASES)(
    "%s is absent in baseline and present in %s",
    async (flag, scenario) => {
      const base = await check("baseline", flag);
      expect(base.present, `baseline: ${base.evidence}`).toBe(false);
      const defect = await check(scenario, flag);
      expect(defect.present, `${scenario}: ${defect.evidence}`).toBe(true);
    },
    60_000,
  );

  // The state of the scenario reaches the front after the first paint; on a slow runner it can take
  // long. The confirmers must wait for it instead of reporting a plain UI as "defect absent".
  it.each(["ui.testid_rotating", "ui.ambiguous_labels"])(
    "%s is still detected when the scenario state arrives late",
    async (flag) => {
      const chromium = loadPlaywright(here).chromium;
      const slow = browserConfirmer(
        {
          launch: async (...args) => {
            const browser = await chromium.launch(...args);
            const newContext = browser.newContext.bind(browser);
            browser.newContext = async (...a) => {
              const context = await newContext(...a);
              await context.route("**/__arena/state", async (route) => {
                await new Promise((r) => setTimeout(r, 1500));
                await route.continue();
              });
              return context;
            };
            return browser;
          },
        },
        arenaUrl!,
        client,
      );
      try {
        await client.setScenario("fase1-localizadores");
        await client.reset();
        const [r] = await slow.confirm([flag]);
        expect(r!.present, r!.evidence).toBe(true);
      } finally {
        await slow.close();
        await client.reset();
      }
    },
    60_000,
  );
});
