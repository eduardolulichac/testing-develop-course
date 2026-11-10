import type { Confirmer } from "@course/scenario-engine";

const confirm: Confirmer = async (c) => {
  const r = await c.request("GET", "/api/products?category=Libros");
  return {
    present: r.status === 500,
    evidence: `GET /api/products?category=Libros -> ${r.status}`,
  };
};
export default confirm;
