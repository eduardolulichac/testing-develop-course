/**
 * Auth E2E suite (E1-A5). Also a live example for the course: role-based locators,
 * custom fixtures, and reading emails from the local inbox (Mailpit).
 *
 * Needs local Supabase (`pnpm db:start`) and .env.local (see .env.example).
 */
import { expect, signIn, test, uniqueEmail } from "./support/fixtures";
import { firstLink, waitForEmail } from "./support/mailpit";

function formAlert(page: import("@playwright/test").Page, text: string | RegExp) {
  // Next.js also renders an empty role="alert" route announcer, so filter by text.
  return page.getByRole("alert").filter({ hasText: text });
}

test.describe("protected routes", () => {
  for (const path of ["/roadmap", "/perfil", "/onboarding", "/lecciones/0-1-entorno-y-terminal"]) {
    test(`${path} redirects anonymous visitors to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
      await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    });
  }

  test("public pages stay public", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Empezar gratis" })).toBeVisible();
  });
});

test.describe("sign up with email and password", () => {
  test("registers, confirms the email and completes onboarding", async ({
    page,
    cleanupEmails,
  }) => {
    const email = uniqueEmail("signup");
    cleanupEmails.push(email);

    await page.goto("/registro");
    await page.getByLabel("Nombre").fill("Ana QA");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Clave").fill("una-clave-segura");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page).toHaveURL("/verifica-tu-correo");

    // Before confirming, sign in is rejected with a clear message.
    await signIn(page, { email, password: "una-clave-segura" });
    await expect(formAlert(page, "Confirma tu correo")).toBeVisible();

    const html = await waitForEmail(email, "Confirma tu correo");
    await page.goto(firstLink(html));
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole("heading", { name: "Hola, Ana QA" })).toBeVisible();

    await page.getByLabel("QA manual, de 1 a 3 años").check();
    await page
      .getByLabel("¿Qué quieres lograr con el curso?")
      .fill("Mi primer trabajo en automatización");
    await page.getByRole("button", { name: "Empezar el curso" }).click();

    await expect(page).toHaveURL("/roadmap");
    await expect(page.getByRole("button", { name: "Cerrar sesión" }).first()).toBeVisible();
  });

  test("validates the form before calling the server", async ({ page }) => {
    await page.goto("/registro");
    await page.getByLabel("Nombre").fill("Ana");
    await page.getByLabel("Correo").fill("no-es-un-correo");
    await page.getByLabel("Clave").fill("corta");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(formAlert(page, "Escribe un correo válido.")).toBeVisible();
    await expect(page).toHaveURL("/registro");
  });
});

test.describe("sign in", () => {
  test("rejects a wrong password with a generic message", async ({ page, confirmedUser }) => {
    await signIn(page, { email: confirmedUser.email, password: "clave-incorrecta" });
    await expect(formAlert(page, "Correo o clave incorrectos.")).toBeVisible();
  });

  test("sends users without onboarding to onboarding first", async ({ page, confirmedUser }) => {
    await signIn(page, confirmedUser);
    await expect(page).toHaveURL(/\/onboarding\?next=%2Froadmap/);
  });

  test("returns to the page that was requested", async ({ page, onboardedUser }) => {
    await page.goto("/perfil");
    await expect(page).toHaveURL("/login?next=%2Fperfil");
    await page.getByLabel("Correo").fill(onboardedUser.email);
    await page.getByLabel("Clave").fill(onboardedUser.password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL("/perfil");
  });

  test("ignores external redirect targets", async ({ page, onboardedUser }) => {
    await signIn(page, onboardedUser, "https://evil.example");
    await expect(page).toHaveURL("/roadmap");
  });

  test("signed-in users skip the login page", async ({ page, onboardedUser }) => {
    await signIn(page, onboardedUser);
    await expect(page).toHaveURL("/roadmap");
    await page.goto("/login");
    await expect(page).toHaveURL("/roadmap");
  });
});

test.describe("sign out", () => {
  test("ends the session and protects private pages again", async ({ page, onboardedUser }) => {
    await signIn(page, onboardedUser);
    await expect(page).toHaveURL("/roadmap");

    await page.getByRole("button", { name: "Cerrar sesión" }).first().click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "Iniciar sesión" }).first()).toBeVisible();

    await page.goto("/perfil");
    await expect(page).toHaveURL("/login?next=%2Fperfil");
  });
});

test.describe("password recovery", () => {
  test("resets the password through the emailed link", async ({ page, onboardedUser }) => {
    await page.goto("/recuperar-clave");
    await page.getByLabel("Correo").fill(onboardedUser.email);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Si existe una cuenta" }),
    ).toBeVisible();

    const html = await waitForEmail(onboardedUser.email, "Recupera tu clave");
    await page.goto(firstLink(html));
    await expect(page).toHaveURL("/actualizar-clave");

    const newPassword = "nueva-clave-segura-1";
    await page.getByLabel("Clave nueva").fill(newPassword);
    await page.getByLabel("Repite la clave").fill(newPassword);
    await page.getByRole("button", { name: "Guardar clave" }).click();
    await expect(page).toHaveURL("/perfil?clave=actualizada");
    await expect(page.getByText("Tu clave se actualizó.")).toBeVisible();

    await page.getByRole("button", { name: "Cerrar sesión" }).first().click();
    await expect(page).toHaveURL("/");
    await signIn(page, { email: onboardedUser.email, password: newPassword });
    await expect(page).toHaveURL("/roadmap");
  });

  test("does not reveal whether an email is registered", async ({ page }) => {
    await page.goto("/recuperar-clave");
    await page.getByLabel("Correo").fill(uniqueEmail("nobody"));
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Si existe una cuenta" }),
    ).toBeVisible();
  });

  test("an invalid link shows a friendly error", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=invalido&type=recovery&next=/actualizar-clave");
    await expect(page).toHaveURL("/auth/error?motivo=enlace");
    await expect(page.getByText("El enlace no es válido o ya caducó.")).toBeVisible();
  });
});

test.describe("Google OAuth", () => {
  test("starts the OAuth flow through Supabase Auth", async ({ page }) => {
    // Stay offline: stop at Supabase's authorize endpoint instead of following the redirect
    // to Google (route handlers do not see redirect hops). Real Google login is manual.
    let authorizeUrl: URL | undefined;
    await page.route("**/auth/v1/authorize?**", async (route) => {
      authorizeUrl = new URL(route.request().url());
      await route.fulfill({ status: 200, contentType: "text/plain", body: "oauth stub" });
    });

    await page.goto("/login?next=%2Fperfil");
    await page.getByRole("button", { name: "Continuar con Google" }).click();
    await expect.poll(() => authorizeUrl?.searchParams.get("provider")).toBe("google");

    const redirectTo = new URL(authorizeUrl!.searchParams.get("redirect_to") ?? "");
    expect(redirectTo.pathname).toBe("/auth/callback");
    expect(redirectTo.searchParams.get("next")).toBe("/perfil");
    // PKCE: the code challenge is sent, the verifier stays in a cookie.
    expect(authorizeUrl!.searchParams.get("code_challenge")).toBeTruthy();
  });

  test("the callback without a valid code shows an error", async ({ page }) => {
    await page.goto("/auth/callback?code=invalido");
    await expect(page).toHaveURL("/auth/error?motivo=callback");
  });
});
