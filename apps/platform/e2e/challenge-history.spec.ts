import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { adminClient, expect, signIn, test, type TestUser } from "./support/fixtures";

const LESSON = "0-1-entorno-y-terminal";
const SHA = "4f1c0e5b9a7d3c2e1f0a9b8c7d6e5f4a3b2c1d0e";

const criteria = {
  version: 1,
  arena: { escenario: "fase1-login", release: null, semilla: 1046 },
  umbral: 70,
  obligatorios: ["suite-ejecuta"],
  criterios: [
    {
      id: "suite-ejecuta",
      titulo: "La suite se ejecuta",
      peso: 60,
      competencia: "tecnica",
      feedback_fallo: "PISTA-SECRETA-1",
      tipo: "suite_ejecuta",
      min: 1,
    },
    {
      id: "sin-only",
      titulo: "Sin .only",
      peso: 40,
      competencia: "tecnica",
      feedback_fallo: "Quita el .only de tus tests",
      tipo: "estatico",
      regla: "sin-only",
    },
  ],
};

type Seed = { slug: string; exerciseId: string; linkId: string; repo: string };

/** A published challenge and an active link for `user`, with random ids so specs do not collide. */
async function seedChallenge(user: TestUser): Promise<Seed> {
  const admin = adminClient();
  const slug = `hist-e2e-${randomUUID().slice(0, 8)}`;
  const { data: lesson } = await admin.from("lessons").select("id").eq("slug", LESSON).single();
  const { data: exercise, error } = await admin
    .from("exercises")
    .insert({
      lesson_id: lesson?.id,
      slug,
      tipo: "reto",
      titulo: "Reto",
      criterio_aprobacion: criteria,
    })
    .select("id")
    .single();
  if (error) throw error;
  const githubId = randomInt(10_000, 9_000_000);
  const repo = `gh${githubId}/${slug}`;
  const { data: link, error: linkError } = await admin
    .from("challenge_links")
    .insert({
      user_id: user.id,
      exercise_id: exercise.id,
      key_id: `ck_${randomBytes(16).toString("base64url")}`,
      github_id: githubId,
      github_user: `gh${githubId}`,
      repo_id: randomInt(10_000, 9_000_000),
      repo_full_name: repo,
      repo_url: `https://github.com/${repo}`,
    })
    .select("id")
    .single();
  if (linkError) throw linkError;
  return { slug, exerciseId: exercise.id, linkId: link.id, repo };
}

async function addSubmission(user: TestUser, s: Seed, fields: Record<string, unknown>) {
  const { error } = await adminClient()
    .from("submissions")
    .insert({
      user_id: user.id,
      exercise_id: s.exerciseId,
      challenge_link_id: s.linkId,
      repo_url: `https://github.com/${s.repo}`,
      commit_sha: SHA,
      run_id: randomInt(1_000_000_000, 9_000_000_000),
      ...fields,
    });
  if (error) throw error;
}

async function cleanup(s: Seed) {
  const admin = adminClient();
  await admin.from("submissions").delete().eq("exercise_id", s.exerciseId);
  await admin.from("challenge_links").delete().eq("exercise_id", s.exerciseId);
  await admin.from("exercises").delete().eq("id", s.exerciseId);
}

const verified = (
  resultado: string,
  puntaje: number | null,
  intento: number,
  criterios: unknown,
) => ({
  estado_verificacion: "verificado",
  resultado,
  puntaje,
  intento,
  detalle_json: { criterios },
});

test.describe("challenge history", () => {
  test("lists criteria without hints, then shows each submission with its detail", async ({
    page,
    onboardedUser,
  }) => {
    const s = await seedChallenge(onboardedUser);
    try {
      await signIn(page, onboardedUser, `/retos/${s.slug}`);
      await expect(page.getByTestId("challenge-criteria")).toContainText("La suite se ejecuta");
      await expect(page.getByTestId("challenge-criteria")).toContainText("obligatorio");
      // Nothing to hint at before the student fails a criterion.
      await expect(page.locator("body")).not.toContainText("PISTA-SECRETA-1");
      await expect(page.getByTestId("challenge-history")).toContainText("Aún no has entregado");
      await expect(page.getByTestId("submissions-remaining")).toContainText("10 envíos");

      await addSubmission(
        onboardedUser,
        s,
        verified("reprobado", 60, 1, [
          {
            id: "suite-ejecuta",
            status: "pass",
            evidence: "4 tests encontrados",
            titulo: "La suite se ejecuta",
          },
          {
            id: "sin-only",
            status: "fail",
            evidence: "<script>window.__xss = 1</script> .only en tests/a.spec.ts:3",
            titulo: "Sin .only",
            feedback_fallo: "Quita el .only de tus tests",
          },
        ]),
      );
      await addSubmission(onboardedUser, s, {
        ...verified("aprobado", 100, 2, [
          {
            id: "suite-ejecuta",
            status: "pass",
            evidence: "5 tests",
            titulo: "La suite se ejecuta",
          },
          { id: "sin-only", status: "pass", evidence: "Sin .only", titulo: "Sin .only" },
        ]),
        created_at: new Date(Date.now() + 1000).toISOString(),
      });
      await addSubmission(onboardedUser, s, {
        estado_verificacion: "rechazado",
        motivo: "run_not_verified",
        verificacion_json: { reason: "head_sha_mismatch" },
      });
      await addSubmission(
        onboardedUser,
        s,
        verified("error", null, 3, [
          {
            id: "suite-ejecuta",
            status: "error",
            evidence: "La Arena no levantó",
            titulo: "La suite se ejecuta",
          },
          { id: "sin-only", status: "pass", evidence: "Sin .only", titulo: "Sin .only" },
        ]),
      );
      await page.reload();

      const items = page.getByTestId("submission");
      await expect(items).toHaveCount(4);
      await expect(page.getByTestId("submissions-remaining")).toContainText("6 envíos");

      const failed = items.filter({ hasText: "Reprobado" });
      await expect(failed).toContainText("60 / 100");
      await expect(failed).toContainText("intento 1");
      await expect(failed).toContainText("Pista: Quita el .only de tus tests");
      // The evidence is plain text: the tag is shown, never executed.
      await expect(failed).toContainText("<script>window.__xss = 1</script>");
      expect(
        await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
      ).toBeUndefined();

      const approved = items.filter({ hasText: "Aprobado" });
      await expect(approved).toContainText("100 / 100");
      await expect(approved).not.toContainText("Pista:");
      await expect(approved.getByRole("link", { name: "4f1c0e5" })).toHaveAttribute(
        "href",
        `https://github.com/${s.repo}/commit/${SHA}`,
      );
      await expect(approved.getByRole("link", { name: "ejecución" })).toHaveAttribute(
        "href",
        new RegExp(`^https://github.com/${s.repo}/actions/runs/\\d+$`),
      );

      const rejected = items.filter({ hasText: "¿cambiaste el workflow" });
      await expect(rejected).toHaveCount(1);
      // Neither GitHub's snapshot nor the internal reason reaches the page.
      await expect(page.locator("body")).not.toContainText("head_sha_mismatch");
      await expect(page.locator("body")).not.toContainText("run_not_verified");

      await expect(items.filter({ hasText: "Error del entorno" })).toContainText("no tuyo");
    } finally {
      await cleanup(s);
    }
  });

  test("another student sees none of these submissions", async ({ page, onboardedUser }) => {
    const owner = await seedOwner();
    const s = await seedChallenge(owner.user);
    try {
      await addSubmission(
        owner.user,
        s,
        verified("aprobado", 100, 1, [
          { id: "suite-ejecuta", status: "pass", evidence: "ok", titulo: "La suite se ejecuta" },
        ]),
      );
      await signIn(page, onboardedUser, `/retos/${s.slug}`);
      await expect(page.getByTestId("challenge-history")).toContainText("Aún no has entregado");
      await expect(page.getByTestId("submission")).toHaveCount(0);
    } finally {
      await cleanup(s);
      await adminClient().auth.admin.deleteUser(owner.user.id);
    }
  });
});

/** A second confirmed user that owns the data. */
async function seedOwner(): Promise<{ user: TestUser }> {
  const email = `owner-${randomUUID().slice(0, 8)}@e2e.test`;
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "unused-Password-1!",
    email_confirm: true,
  });
  if (error) throw error;
  return {
    user: { id: data.user.id, email, password: "unused-Password-1!", nombre: "Owner" },
  };
}
