"use server";

import { redirect } from "next/navigation";
import { siteUrl } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import { postAuthPath } from "@/lib/profile/queries";
import { createClient } from "@/lib/supabase/server";
import {
  firstIssue,
  newPasswordSchema,
  resetRequestSchema,
  signInSchema,
  signUpSchema,
} from "./schemas";

export type FormState = { error?: string; message?: string; email?: string };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error), email: field(formData, "email") };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        error: "Confirma tu correo antes de entrar. Revisa tu bandeja de entrada.",
        email: parsed.data.email,
      };
    }
    // Generic message: do not reveal whether the account exists.
    return { error: "Correo o clave incorrectos.", email: parsed.data.email };
  }

  redirect(await postAuthPath(supabase, data.user.id, safeNextPath(field(formData, "next"))));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    nombre: field(formData, "nombre"),
    email: field(formData, "email"),
    password: field(formData, "password"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error), email: field(formData, "email") };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${siteUrl()}/onboarding`,
      data: { full_name: parsed.data.nombre },
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return {
        error: "Esa clave es demasiado débil. Prueba con una más larga.",
        email: parsed.data.email,
      };
    }
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { error: "Demasiados intentos. Espera un momento y vuelve a probar." };
    }
    console.error("signUp failed", { code: error.code, status: error.status });
    return { error: "No pudimos crear la cuenta. Inténtalo de nuevo." };
  }

  // Same outcome whether or not the email already exists (avoids account enumeration).
  redirect("/verifica-tu-correo");
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNextPath(field(formData, "next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) {
    console.error("Google OAuth start failed", { code: error?.code });
    redirect("/auth/error?motivo=google");
  }
  redirect(data.url);
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse({ email: field(formData, "email") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/actualizar-clave`,
  });
  if (error && error.status === 429) {
    return { error: "Demasiados intentos. Espera un momento y vuelve a probar." };
  }
  if (error) console.error("resetPasswordForEmail failed", { code: error.code });

  return {
    message:
      "Si existe una cuenta con ese correo, te enviamos un enlace para elegir una clave nueva.",
  };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse({
    password: field(formData, "password"),
    confirm: field(formData, "confirm"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { error: "La clave nueva debe ser distinta de la anterior." };
    }
    if (error.code === "weak_password") {
      return { error: "Esa clave es demasiado débil. Prueba con una más larga." };
    }
    return { error: "No pudimos actualizar la clave. Pide un enlace nuevo." };
  }

  redirect("/perfil?clave=actualizada");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
