import { afterAll, describe, expect, it } from "vitest";
import {
  EXPECTED_FLAKY_POSITIONS,
  flakyCheckoutPositions,
} from "../../scenarios/fase1-fallos-sembrados/positions.ts";
import { appInjectClient, makeApp, type TestApp } from "./helpers.js";

// H21: the same golden positions are asserted against the Docker Arena by `evaluator/test`.
describe("api.flaky_checkout position (PGlite)", () => {
  let t: TestApp;
  afterAll(() => t?.close());

  it("is one per window of 10 and matches the golden positions", async () => {
    t = await makeApp({ ARENA_DEPLOYMENT: "ephemeral" });
    const positions = await flakyCheckoutPositions(appInjectClient(t.app));
    expect(positions).toHaveLength(3);
    expect(positions.map((p) => Math.floor(p / 10))).toEqual([0, 1, 2]);
    expect(positions).toEqual([...EXPECTED_FLAKY_POSITIONS]);
  });
});
