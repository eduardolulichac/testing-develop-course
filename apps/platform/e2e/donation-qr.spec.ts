import { expect, signIn, test } from "./support/fixtures";

test.describe("donation QR", () => {
  test("shows on the roadmap, can be hidden and stays hidden", async ({ page, onboardedUser }) => {
    await signIn(page, onboardedUser, "/roadmap");
    const card = page.getByTestId("donation-qr");
    await expect(card).toBeVisible();
    await expect(card.getByRole("img", { name: "Código QR para aportar con Yape" })).toBeVisible();

    await card.getByRole("button", { name: "Ocultar" }).click();
    await expect(card).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Roadmap" })).toBeVisible();
    await expect(page.getByTestId("donation-qr")).toHaveCount(0);
  });
});
