import { randomUUID } from "node:crypto";
import { adminClient, expect, signIn, test } from "./support/fixtures";

// A challenge in module 900N.8 (>= 1.8) shows the AI log; one in module 0.1 does not.

async function seedChallenge(codigo: string | null) {
  const admin = adminClient();
  const slug = `ia-e2e-${randomUUID().slice(0, 8)}`;
  let lessonId: string;
  let moduleId: string | null = null;
  let lessonCreated = false;
  if (codigo) {
    const { data: phase } = await admin.from("phases").select("id").eq("orden", 1).single();
    const { data: mod, error } = await admin
      .from("modules")
      .insert({
        phase_id: phase!.id,
        codigo,
        titulo: "IA E2E",
        orden: 3000 + Math.floor(Math.random() * 20_000),
        prerequisitos: [],
      })
      .select("id")
      .single();
    if (error) throw error;
    moduleId = mod.id;
    const { data: lesson, error: lessonError } = await admin
      .from("lessons")
      .insert({
        module_id: mod.id,
        slug,
        titulo: "L",
        orden: 1,
        version: "2026-11",
        duracion_min: 10,
        estado: "publicado",
      })
      .select("id")
      .single();
    if (lessonError) throw lessonError;
    lessonId = lesson.id;
    lessonCreated = true;
  } else {
    const { data: lesson } = await admin
      .from("lessons")
      .select("id")
      .eq("slug", "0-1-entorno-y-terminal")
      .single();
    lessonId = lesson!.id;
  }
  const { data: exercise, error } = await admin
    .from("exercises")
    .insert({ lesson_id: lessonId, slug, tipo: "reto", titulo: "Reto IA" })
    .select("id")
    .single();
  if (error) throw error;
  return {
    slug,
    cleanup: async () => {
      await admin.from("ai_logs").delete().eq("exercise_id", exercise.id);
      await admin.from("exercises").delete().eq("id", exercise.id);
      if (lessonCreated) await admin.from("lessons").delete().eq("id", lessonId);
      if (moduleId) await admin.from("modules").delete().eq("id", moduleId);
    },
  };
}

test.describe("AI usage log", () => {
  test("add, edit and delete an entry in an AI challenge", async ({ page, onboardedUser }) => {
    const s = await seedChallenge(`${7000 + Math.floor(Math.random() * 1000)}.8`);
    try {
      await signIn(page, onboardedUser, `/retos/${s.slug}`);
      await expect(page.getByRole("heading", { name: "Registro de uso de IA" })).toBeVisible();

      await page
        .getByLabel("¿Qué le pediste a la IA?")
        .first()
        .fill("Pedí un test de login con Playwright");
      await page.getByLabel("¿Qué hiciste con el resultado?").first().selectOption("modifico");
      await page
        .getByLabel(/¿Qué corregiste/)
        .first()
        .fill("Cambié el selector por getByRole");
      await page.getByRole("button", { name: "Añadir al registro" }).click();

      const item = page.getByTestId("ai-log-list").getByRole("listitem").first();
      await expect(item).toContainText("Pedí un test de login con Playwright");
      await expect(item).toContainText("Lo modifiqué");

      await item.getByText("Editar").click();
      await item.getByLabel("¿Qué hiciste con el resultado?").selectOption("rechazo");
      await item.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(item).toContainText("Lo rechacé");

      await item.getByRole("button", { name: "Borrar" }).click();
      await expect(page.getByTestId("ai-log-list")).toHaveCount(0);
    } finally {
      await s.cleanup();
    }
  });

  test("shows an error for a too-short prompt and no panel in an early challenge", async ({
    page,
    onboardedUser,
  }) => {
    const ai = await seedChallenge(`${8000 + Math.floor(Math.random() * 1000)}.8`);
    const early = await seedChallenge(null);
    try {
      await signIn(page, onboardedUser, `/retos/${ai.slug}`);
      const prompt = page.getByLabel("¿Qué le pediste a la IA?").first();
      await prompt.evaluate((el) => el.removeAttribute("minlength"));
      await prompt.fill("corto");
      await page.getByLabel("¿Qué hiciste con el resultado?").first().selectOption("acepto");
      await page.getByRole("button", { name: "Añadir al registro" }).click();
      await expect(page.getByTestId("ai-log-form").getByRole("alert")).toContainText(
        "mínimo 10 caracteres",
      );

      await page.goto(`/retos/${early.slug}`);
      await expect(
        page
          .getByRole("heading", { name: "Qué se evalúa" })
          .or(page.getByText("Vincula tu repositorio")),
      ).toBeVisible();
      await expect(page.getByTestId("ai-log-panel")).toHaveCount(0);
    } finally {
      await ai.cleanup();
      await early.cleanup();
    }
  });
});
