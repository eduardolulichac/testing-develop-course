/**
 * H21: the injected 503s of `api.flaky_checkout` fall on the same calls in the published Arena
 * (Docker, real Postgres) as in the API tested with PGlite. Skipped unless SELFTEST_ARENA_URL is set.
 */
import { fetchClient } from "@arena/scenarios";
import {
  EXPECTED_FLAKY_POSITIONS,
  flakyCheckoutPositions,
} from "../../apps/qa-arena/scenarios/fase1-fallos-sembrados/positions.ts";
import { describe, expect, it } from "vitest";

const arenaUrl = process.env.SELFTEST_ARENA_URL;

describe.skipIf(!arenaUrl)("api.flaky_checkout position (Docker)", () => {
  it("matches the PGlite positions on a fresh session, twice in a row", async () => {
    const c = fetchClient(arenaUrl!, { runnerToken: process.env.SELFTEST_ARENA_TOKEN });
    expect(await flakyCheckoutPositions(c)).toEqual([...EXPECTED_FLAKY_POSITIONS]);
    // A reset restarts the counters: the same positions again.
    expect(await flakyCheckoutPositions(c)).toEqual([...EXPECTED_FLAKY_POSITIONS]);
  }, 60_000);
});
