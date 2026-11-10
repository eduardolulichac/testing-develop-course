import { expect, signIn, test } from "./support/fixtures";

test.describe("profile", () => {
  test("shows the account and saves changes", async ({ page, onboardedUser }) => {
    await signIn(page, onboardedUser, "/perfil");
    await expect(page).toHaveURL("/perfil");
    await expect(page.getByTestId("profile-email")).toHaveText(onboardedUser.email);
    await expect(page.getByTestId("profile-level")).toHaveText("Fundamentos");
    await expect(page.getByLabel("QA manual, de 1 a 3 años")).toBeChecked();

    await page.getByLabel("Nombre").fill("Nombre Editado");
    await page.getByLabel("Ya automaticé algo").check();
    await page.getByLabel("¿Qué quieres lograr con el curso?").fill("Liderar un equipo de QA");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Perfil actualizado." })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Nombre")).toHaveValue("Nombre Editado");
    await expect(page.getByLabel("Ya automaticé algo")).toBeChecked();
    await expect(page.getByLabel("¿Qué quieres lograr con el curso?")).toHaveValue(
      "Liderar un equipo de QA",
    );
  });

  test("onboarding requires both answers", async ({ page, confirmedUser }) => {
    await signIn(page, confirmedUser);
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByRole("button", { name: "Empezar el curso" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Elige tu experiencia previa." }),
    ).toBeVisible();
  });
});

test.describe("responsive navigation @mobile", () => {
  test("the mobile menu lets a signed-in user sign out", async ({ page, onboardedUser }, info) => {
    test.skip(info.project.name !== "mobile", "mobile layout only");
    await signIn(page, onboardedUser);
    await expect(page).toHaveURL("/roadmap");
    await page.getByText("Menú").click();
    await page
      .getByRole("navigation", { name: "Menú móvil" })
      .getByRole("button", { name: "Cerrar sesión" })
      .click();
    await expect(page).toHaveURL("/");
  });
});
