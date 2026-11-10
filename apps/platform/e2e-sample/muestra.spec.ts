import { expect, test } from "@playwright/test";

test("sample lesson renders every MDX component without a session", async ({ page }) => {
  await page.goto("/muestra");
  await expect(page).toHaveURL(/\/muestra$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Localizadores estables");
  for (const id of [
    "objetivo",
    "paso",
    "ejemplo",
    "ejercicio",
    "reto",
    "resumen",
    "error-comun",
    "quiz",
  ]) {
    await expect(page.getByTestId(`mdx-${id}`).first()).toBeVisible();
  }
  await expect(page.getByTestId("mdx-abrir-arena")).toHaveAttribute(
    "href",
    "http://localhost:3300/?escenario=fase1-localizadores",
  );
});

test("hints and quiz are usable with the keyboard", async ({ page }) => {
  await page.goto("/muestra");
  const hint = page.getByText("Pista 1 de 3");
  await hint.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Piensa en qué es el elemento")).toBeVisible();

  const option = page.getByRole("radio", { name: "Rol y nombre accesible" });
  await option.focus();
  await page.keyboard.press("Space");
  await expect(option).toBeChecked();
});

test("no horizontal overflow", async ({ page }) => {
  await page.goto("/muestra");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("code blocks can be copied", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are chromium-only");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/muestra");
  const block = page.locator("pre").first();
  const expected = (await block.textContent())?.trim();
  await block
    .locator("xpath=..")
    .getByRole("button", { name: /Copiar/ })
    .click();
  await expect(page.getByRole("button", { name: /Copiado/ }).first()).toBeVisible();
  expect((await page.evaluate(() => navigator.clipboard.readText())).trim()).toBe(expected);
});
