import { expect, test } from "@playwright/test";

test.describe("privacy notice", () => {
  test("is public and linked from the sign-up page and the footer", async ({ page }) => {
    await page.goto("/registro");
    await page.getByRole("link", { name: "Ver el aviso de datos" }).click();
    await expect(page).toHaveURL("/privacidad");
    await expect(page.getByRole("heading", { name: "Datos y privacidad", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Qué guardamos" })).toBeVisible();

    await page.goto("/login");
    await page.getByRole("contentinfo").getByRole("link", { name: "Más información" }).click();
    await expect(page).toHaveURL("/privacidad");
  });
});
