import { adminClient, expect, signIn, test } from "./support/fixtures";

// The seed (supabase/seed.sql) publishes one lesson, in module 0.1.
test.describe("roadmap", () => {
  test("shows the module state of each user", async ({ page, onboardedUser }) => {
    const admin = adminClient();
    const { data: lesson, error } = await admin
      .from("lessons")
      .select("id, slug")
      .eq("estado", "publicado")
      .limit(1)
      .single();
    if (error) throw error;

    await signIn(page, onboardedUser, "/roadmap");
    const status = page.getByTestId("module-status-0.1");
    await expect(status).toHaveText("Disponible");
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");

    await admin
      .from("progress")
      .insert({ user_id: onboardedUser.id, lesson_id: lesson.id, estado: "en_curso" });
    await page.reload();
    await expect(status).toHaveText("En curso");

    await admin
      .from("progress")
      .update({ estado: "completada", completed_at: new Date().toISOString() })
      .eq("user_id", onboardedUser.id)
      .eq("lesson_id", lesson.id);
    await page.reload();
    await expect(status).toHaveText("Completado");
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    await expect(page.getByRole("link", { name: /Entorno y terminal/ })).toHaveAttribute(
      "href",
      `/lecciones/${lesson.slug}`,
    );
  });

  test("another user keeps their own state", async ({ page, onboardedUser }) => {
    await signIn(page, onboardedUser, "/roadmap");
    await expect(page.getByTestId("module-status-0.1")).toHaveText("Disponible");
  });
});
