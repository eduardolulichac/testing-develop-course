import { randomInt } from "node:crypto";
import { adminClient, expect, signIn, test } from "./support/fixtures";
import { seed, signedRequest, type Seed } from "./support/webhook-seed";

// Other specs publish challenges in the same tramo while this one runs (fully parallel), so the
// coverage of tramo 1 is not under this spec's control: the provisional level text is covered by
// tests/db/levels.test.ts and lib/profile/level-view.test.ts. Here: the page reflects the evidence.

test.describe("/perfil level section", () => {
  let s: Seed;
  test.beforeEach(async () => {
    s = await seed();
    await adminClient()
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", s.userId);
  });
  test.afterEach(async () => {
    const admin = adminClient();
    await admin.from("level_state").delete().eq("user_id", s.userId);
    await admin.from("competency_scores").delete().eq("user_id", s.userId);
    await s.cleanup();
  });

  test("shows no evidence before any submission, then reflects an approved challenge", async ({
    page,
    request,
  }) => {
    await signIn(page, s, "/perfil");
    await expect(page.getByRole("heading", { name: "Competencias" })).toBeVisible();
    await expect(page.getByTestId("profile-level")).toHaveText("Fundamentos");
    await expect(page.getByText("Sin evidencia todavía")).toHaveCount(5);
    await expect(page.getByText("Todavía no has aprobado ningún reto.")).toBeVisible();

    const res = await request.post(
      "/api/webhooks/challenge-result",
      signedRequest(s, randomInt(1, 2_000_000_000)),
    );
    expect(res.status()).toBe(201);

    await page.reload();
    const tecnica = page.getByTestId("competency-tecnica");
    await expect(tecnica).toContainText("100");
    await expect(tecnica).toContainText("Evidencia: 1 reto");
    await expect(page.getByText("Sin evidencia todavía")).toHaveCount(4);
    const row = page.getByTestId("approved-challenges").getByRole("row").nth(1);
    await expect(row).toContainText("×1");
    await expect(row).toContainText("100");
    await expect(page.getByTestId("level-requirements")).toBeVisible();
  });
});
