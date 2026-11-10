import type { Confirmer } from "@course/scenario-engine";

/** Smoke check: the same result is expected on the baseline (see `smoke`). */
export const smoke = true;

const confirm: Confirmer = async (c) => {
  const products = await c.request("GET", "/api/products");
  const state = await c.request("GET", "/__arena/state");
  const release = products.headers["x-arena-release"];
  const ok =
    products.status === 200 &&
    release !== undefined &&
    String(state.body.seedVersion).startsWith("arena-seed-2");
  return {
    present: ok,
    evidence: `products ${products.status}, release ${release}, seed ${state.body.seedVersion}`,
  };
};
export default confirm;
