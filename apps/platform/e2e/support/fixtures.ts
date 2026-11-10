import { randomUUID } from "node:crypto";
import { test as base, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type TestUser = { id: string; email: string; password: string; nombre: string };

/** Admin client with the secret key. Only used by tests, never by the app in the browser. */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error(
      "E2E needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.example)",
    );
  }
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
}

type Fixtures = {
  /** A confirmed user created through the admin API and deleted after the test. */
  confirmedUser: TestUser;
  /** Same as confirmedUser but with onboarding already completed. */
  onboardedUser: TestUser;
  /** Emails registered through the UI during the test; deleted afterwards. */
  cleanupEmails: string[];
};

async function createConfirmedUser(onboarded: boolean): Promise<TestUser> {
  const admin = adminClient();
  const user = {
    email: uniqueEmail(),
    password: `Clave-${randomUUID().slice(0, 12)}`,
    nombre: "Alumna E2E",
  };
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: user.nombre },
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  if (onboarded) {
    const { error: updateError } = await admin
      .from("profiles")
      .update({
        experiencia_previa: "manual_1_3",
        objetivo: "Automatizar pruebas",
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", data.user.id);
    if (updateError) throw updateError;
  }
  return { id: data.user.id, ...user };
}

async function deleteUserByEmail(email: string) {
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = data?.users.find((u) => u.email === email);
  if (user) await admin.auth.admin.deleteUser(user.id);
}

// Playwright fixtures must destructure their first argument, even when unused.
/* eslint-disable no-empty-pattern */
export const test = base.extend<Fixtures>({
  confirmedUser: async ({}, use) => {
    const user = await createConfirmedUser(false);
    await use(user);
    await adminClient().auth.admin.deleteUser(user.id);
  },
  onboardedUser: async ({}, use) => {
    const user = await createConfirmedUser(true);
    await use(user);
    await adminClient().auth.admin.deleteUser(user.id);
  },
  cleanupEmails: async ({}, use) => {
    const emails: string[] = [];
    await use(emails);
    for (const email of emails) await deleteUserByEmail(email);
  },
});
/* eslint-enable no-empty-pattern */

export { expect };

/** Signs in through the login form. */
export async function signIn(
  page: Page,
  user: Pick<TestUser, "email" | "password">,
  next?: string,
) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Correo").fill(user.email);
  await page.getByLabel("Clave").fill(user.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
}
