import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { adminClient, expect, signIn, test } from "./support/fixtures";

const SLUG = "0-1-entorno-y-terminal";

// The quiz bank is editorial content that keeps changing: these tests read it instead of
// hardcoding its questions (the lesson page is the real 0.1).
type Question = {
  id: string;
  enunciado: string;
  opciones: string[];
  correcta: number;
  explicacion: string;
};
const QUIZ: Question[] = parse(
  readFileSync(path.resolve(process.cwd(), "../../content/fase-0/0.1.quiz.yaml"), "utf8"),
).preguntas;
const score = (correct: number) => Math.round((correct / QUIZ.length) * 10_000) / 100;
const radio = (quiz: import("@playwright/test").Locator, q: Question, option: number) =>
  quiz.locator(`input[name="q:${q.id}"][value="${option}"]`);

test.describe("lesson page", () => {
  test("renders, saves completion and is reflected in the roadmap", async ({
    page,
    onboardedUser,
  }) => {
    await signIn(page, onboardedUser, `/lecciones/${SLUG}`);
    await expect(page.getByRole("heading", { level: 1, name: "Entorno y terminal" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "1. Objetivo y contexto" }),
    ).toHaveAttribute("id", "1-objetivo-y-contexto");
    await expect(page.getByRole("navigation", { name: "En esta lección" })).toBeAttached();

    await page.getByRole("button", { name: "Marcar como completada" }).click();
    await expect(page.getByTestId("lesson-completed")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("lesson-completed")).toBeVisible();

    await page.goto("/roadmap");
    await expect(page.getByTestId("module-status-0.1")).toHaveText("Completado");
  });

  test("saves the module rating once, updates it and keeps it after reload", async ({
    page,
    onboardedUser,
  }) => {
    await signIn(page, onboardedUser, `/lecciones/${SLUG}`);
    // The rating form only appears once the lesson is completed.
    await expect(page.getByTestId("lesson-feedback")).toHaveCount(0);
    await page.getByRole("button", { name: "Marcar como completada" }).click();
    await expect(page.getByTestId("lesson-feedback")).toBeVisible();

    const form = page.getByTestId("lesson-feedback");
    await form.getByLabel("4", { exact: true }).check();
    await form.getByLabel(/Comentario/).fill("Claro, pero largo");
    await form.getByRole("button", { name: "Enviar valoración" }).click();
    await expect(page.getByTestId("feedback-saved")).toBeVisible();

    await page.reload();
    await expect(form.getByLabel("4", { exact: true })).toBeChecked();
    await form.getByLabel("2", { exact: true }).check();
    await form.getByRole("button", { name: "Actualizar valoración" }).click();
    await expect(page.getByTestId("feedback-saved")).toBeVisible();

    // The saved message was already visible, so wait for the row itself to change.
    await expect
      .poll(async () => {
        const { data } = await adminClient()
          .from("feedback")
          .select("rating, comentario")
          .eq("user_id", onboardedUser.id);
        return data;
      })
      .toEqual([{ rating: 2, comentario: "Claro, pero largo" }]);
  });

  test.describe("unknown lessons", () => {
    for (const slug of ["no-existe", "..%2F..%2Fpackage", "0-1-Entorno"]) {
      test(`${slug} gives 404`, async ({ page, onboardedUser }) => {
        await signIn(page, onboardedUser, "/roadmap");
        await expect(page).toHaveURL("/roadmap");
        const response = await page.goto(`/lecciones/${slug}`);
        expect(response?.status()).toBe(404);
      });
    }
  });

  test("grades the quiz on the server and stores the attempt", async ({ page, onboardedUser }) => {
    await signIn(page, onboardedUser, `/lecciones/${SLUG}`);
    const quiz = page.getByTestId("mdx-quiz");
    await expect(quiz).toBeVisible();

    // The correct answers and explanations are not in the page before submitting.
    const html = await page.content();
    expect(html).not.toContain(QUIZ[0]!.explicacion.slice(0, 40));
    expect(html).not.toMatch(/correcta\\?"\s*:/);

    // First three correct, the fourth wrong, the rest unanswered.
    for (const q of QUIZ.slice(0, 3)) await radio(quiz, q, q.correcta).check();
    const wrong = QUIZ[3]!;
    await radio(quiz, wrong, (wrong.correcta + 1) % wrong.opciones.length).check();
    await quiz.getByRole("button", { name: "Corregir" }).click();

    await expect(page.getByTestId("quiz-score")).toContainText(
      `Nota: ${score(3)} (3 de ${QUIZ.length})`,
    );
    await expect(page.getByTestId(`quiz-feedback-${QUIZ[0]!.id}`)).toContainText("Correcta.");
    await expect(page.getByTestId(`quiz-feedback-${wrong.id}`)).toContainText(
      `Incorrecta. La respuesta es: ${wrong.opciones[wrong.correcta]}`,
    );
    await expect(page.getByTestId(`quiz-feedback-${QUIZ[4]!.id}`)).toContainText("Sin responder.");

    const { data, error } = await adminClient()
      .from("quiz_attempts")
      .select("nota, respuestas")
      .eq("user_id", onboardedUser.id);
    if (error) throw error;
    expect(data).toHaveLength(1);
    expect(Number(data?.[0]?.nota)).toBe(score(3));
    expect(data?.[0]?.respuestas).toMatchObject({ [QUIZ[0]!.id]: QUIZ[0]!.correcta });

    // Coming back shows the previous attempts.
    await page.reload();
    await expect(page.getByTestId("quiz-previous")).toHaveText(
      `Tu mejor nota: ${score(3)} · Último intento: ${score(3)} · Intentos: 1`,
    );
  });

  test("keeps the chosen answers after grading, moves focus to the result and rejects an empty form", async ({
    page,
    onboardedUser,
  }) => {
    await signIn(page, onboardedUser, `/lecciones/${SLUG}`);
    const quiz = page.getByTestId("mdx-quiz");
    const button = quiz.getByRole("button", { name: /Corregir/ });

    // Nothing marked: the server refuses and stores no attempt.
    await button.click();
    await expect(page.getByTestId("quiz-score")).toContainText("Marca al menos una respuesta.");

    await radio(quiz, QUIZ[0]!, QUIZ[0]!.correcta).check();
    await button.click();
    await expect(page.getByTestId("quiz-score")).toContainText(
      `Nota: ${score(1)} (1 de ${QUIZ.length})`,
    );
    // The choice survives the grading (React 19 used to reset the form), and focus is on the result.
    await expect(radio(quiz, QUIZ[0]!, QUIZ[0]!.correcta)).toBeChecked();
    await expect(page.getByTestId("quiz-score")).toBeFocused();

    // Grading again without touching anything sends the same answers, not an empty form.
    await quiz.getByRole("button", { name: "Corregir de nuevo" }).click();
    await expect(page.getByTestId("quiz-score")).toContainText(
      `Nota: ${score(1)} (1 de ${QUIZ.length})`,
    );

    // Wait for the second attempt to be stored (the score text is the same as before).
    await expect
      .poll(async () => {
        const { data, error } = await adminClient()
          .from("quiz_attempts")
          .select("nota")
          .eq("user_id", onboardedUser.id);
        if (error) throw error;
        return data?.map((a) => Number(a.nota));
      })
      .toEqual([score(1), score(1)]);
  });

  test("guided exercise unlocks hints in order and saves the state", async ({
    page,
    onboardedUser,
  }) => {
    // Lessons are synced in production (`pnpm sync:content`); here the exercise row is created.
    const admin = adminClient();
    const { data: lesson } = await admin.from("lessons").select("id").eq("slug", SLUG).single();
    const { error: upsertError } = await admin.from("exercises").upsert(
      {
        lesson_id: lesson?.id,
        slug: "ej-0-1-crear-carpeta-de-practica",
        tipo: "guiado",
        titulo: "Crea tu carpeta de práctica desde la terminal",
      },
      { onConflict: "slug" },
    );
    if (upsertError) throw upsertError;

    await signIn(page, onboardedUser, `/lecciones/${SLUG}`);
    const exercise = page.getByTestId("mdx-ejercicio").first();
    await expect(exercise).toBeVisible();

    // Hints and solution are not in the page until unlocked.
    const html = await page.content();
    expect(html).not.toContain("mk...");
    expect(html).not.toContain("practica-qa`, entra");
    await expect(exercise.getByRole("button", { name: "Ver la solución" })).toHaveCount(0);

    await exercise.getByRole("button", { name: "Ver pista 1 de 3" }).click();
    await expect(exercise.getByTestId("pista-1")).toContainText("directorio actual");
    await expect(exercise.getByTestId("pista-1")).toBeFocused();
    await expect(exercise.getByTestId("pista-2")).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("pista-1").first()).toBeVisible();

    await exercise.getByRole("button", { name: "Ver pista 2 de 3" }).click();
    await expect(exercise.getByTestId("pista-2")).toContainText("mk...");
    await exercise.getByRole("button", { name: "Ver pista 3 de 3" }).click();
    await expect(exercise.getByTestId("pista-3")).toBeVisible();
    await expect(exercise.getByTestId("solucion")).toHaveCount(0);

    await exercise.getByRole("button", { name: "Ver la solución" }).click();
    await expect(exercise.getByTestId("solucion")).toContainText("mkdir practica-qa");
    await exercise.getByRole("button", { name: "Marcar como resuelto" }).click();
    await expect(exercise.getByTestId("ejercicio-resuelto")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("solucion").first()).toBeVisible();
    await expect(page.getByTestId("ejercicio-resuelto").first()).toBeVisible();

    const { data, error } = await admin
      .from("exercise_progress")
      .select("pistas_vistas, solucion_vista, resuelto")
      .eq("user_id", onboardedUser.id);
    if (error) throw error;
    expect(data).toEqual([{ pistas_vistas: 3, solucion_vista: true, resuelto: true }]);
  });
});
