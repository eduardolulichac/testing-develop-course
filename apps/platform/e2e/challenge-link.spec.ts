import { randomInt } from "node:crypto";
import pg from "pg";
import { adminClient, expect, signIn, test, type TestUser } from "./support/fixtures";

const SLUG = "e2e-reto-vinculo";
const LESSON = "0-1-entorno-y-terminal";
const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

/** Lessons are synced in production; here the challenge row is created (as in the exercise E2E). */
test.beforeAll(async () => {
  const admin = adminClient();
  const { data: lesson } = await admin.from("lessons").select("id").eq("slug", LESSON).single();
  const { error } = await admin
    .from("exercises")
    .upsert(
      { lesson_id: lesson?.id, slug: SLUG, tipo: "reto", titulo: "Reto" },
      { onConflict: "slug" },
    );
  if (error) throw error;
});

/**
 * Real GitHub OAuth is not viable in CI, so the linked identity is seeded by SQL (as postgres).
 * The fake GitHub API (e2e/support/fake-github.mjs) maps the login `gh<id>` to owner id <id>.
 */
async function linkGithubIdentity(user: TestUser): Promise<{ id: number; login: string }> {
  const id = randomInt(10_000, 9_000_000);
  const login = `gh${id}`;
  const pool = new pg.Pool({ connectionString: DB_URL, max: 1 });
  try {
    await pool.query(
      // GoTrue cannot read an identity row whose timestamps are null.
      `insert into auth.identities
         (provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
       values ($1, $2, $3, 'github', now(), now(), now())`,
      [String(id), user.id, JSON.stringify({ sub: String(id), user_name: login })],
    );
  } finally {
    await pool.end();
  }
  return { id, login };
}

async function activeLink(userId: string) {
  const { data, error } = await adminClient()
    .from("challenge_links")
    .select("key_id, key_version, repo_full_name, github_id, revoked_at")
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) throw error;
  return data ?? [];
}

test.describe("challenge linking", () => {
  test("asks to connect GitHub first, and unknown challenges give 404", async ({
    page,
    onboardedUser,
  }) => {
    await signIn(page, onboardedUser, `/retos/${SLUG}`);
    await expect(page.getByRole("button", { name: "Conectar GitHub" })).toBeVisible();
    const missing = await page.goto("/retos/no-existe");
    expect(missing?.status()).toBe(404);
  });

  test("links a public repo, shows the key once, rotates it and unlinks", async ({
    page,
    onboardedUser,
  }) => {
    const gh = await linkGithubIdentity(onboardedUser);
    await signIn(page, onboardedUser, `/retos/${SLUG}`);
    await expect(page.getByTestId("github-account")).toContainText(gh.login);

    await page.getByLabel(/URL de tu repositorio/).fill(`https://github.com/${gh.login}/mi-reto`);
    await page.getByRole("button", { name: "Vincular repositorio" }).click();

    await expect(page.getByTestId("linked-repo")).toContainText(`${gh.login}/mi-reto`);
    const firstKey = (await page.getByTestId("challenge-key-value").textContent())?.trim() ?? "";
    expect(firstKey).toMatch(/^cck_[A-Za-z0-9_-]{43}$/);

    const [link] = await activeLink(onboardedUser.id);
    expect(link).toMatchObject({ key_version: 1, github_id: gh.id });
    expect(link?.key_id).toMatch(/^ck_[A-Za-z0-9_-]{22}$/);
    await expect(page.getByTestId("challenge-key")).toContainText(link!.key_id);

    // Both values come in their own block with a copy button, so nobody has to select them by hand.
    await expect(page.getByTestId("challenge-key-id-value")).toHaveText(link!.key_id);
    await expect(page.getByRole("button", { name: "Copiar secreto" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar identificador de clave" })).toBeVisible();

    // Coming back never shows the key again.
    await page.reload();
    await expect(page.getByTestId("linked-repo")).toBeVisible();
    await expect(page.getByTestId("challenge-key")).toHaveCount(0);

    // Rotating shows a different key and bumps the version.
    await page.getByRole("button", { name: "Rotar clave" }).click();
    await expect(page.getByTestId("challenge-key")).toBeVisible();
    const secondKey = (await page.getByTestId("challenge-key-value").textContent())?.trim() ?? "";
    expect(secondKey).toMatch(/^cck_/);
    expect(secondKey).not.toBe(firstKey);
    await expect.poll(async () => (await activeLink(onboardedUser.id))[0]?.key_version).toBe(2);

    await page.getByRole("button", { name: "Desvincular repositorio" }).click();
    await expect(page.getByLabel(/URL de tu repositorio/)).toBeVisible();
    expect(await activeLink(onboardedUser.id)).toHaveLength(0);
  });

  test("refuses linking and rotating once the hourly budget is spent (H36)", async ({
    page,
    onboardedUser,
  }) => {
    const gh = await linkGithubIdentity(onboardedUser);
    const { error } = await adminClient()
      .from("webhook_rate_buckets")
      .insert({
        bucket: `link:${onboardedUser.id}`,
        window_start: new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString(),
        hits: 10,
      });
    if (error) throw error;
    await signIn(page, onboardedUser, `/retos/${SLUG}`);
    await page.getByLabel(/URL de tu repositorio/).fill(`https://github.com/${gh.login}/mi-reto`);
    await page.getByRole("button", { name: "Vincular repositorio" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "demasiados intentos" })).toBeVisible();
    expect(await activeLink(onboardedUser.id)).toHaveLength(0);
  });

  test("rejects private, forked, foreign and missing repositories", async ({
    page,
    onboardedUser,
  }) => {
    const gh = await linkGithubIdentity(onboardedUser);
    await signIn(page, onboardedUser, `/retos/${SLUG}`);
    const field = page.getByLabel(/URL de tu repositorio/);
    const submit = page.getByRole("button", { name: "Vincular repositorio" });
    const cases: [string, RegExp][] = [
      [`https://github.com/${gh.login}/privado`, /privado/],
      [`https://github.com/${gh.login}/copia`, /fork/],
      [`https://github.com/gh1/otro`, /no pertenece/],
      [`https://github.com/${gh.login}/no-existe`, /No encontramos/],
      ["https://gitlab.com/x/y", /URL del repositorio/],
    ];
    for (const [url, message] of cases) {
      await field.fill(url);
      await submit.click();
      await expect(page.getByTestId("challenge-link-panel").getByRole("alert")).toContainText(
        message,
      );
    }
    expect(await activeLink(onboardedUser.id)).toHaveLength(0);
  });
});
