import type { Confirmer } from "@course/scenario-engine";

const confirm: Confirmer = async (c) => {
  const r = await c.request("POST", "/api/auth/login", {
    body: { email: "Ana@arena.test", password: "Cliente123!" },
  });
  return { present: r.status === 401, evidence: `login with Ana@arena.test -> ${r.status}` };
};
export default confirm;
