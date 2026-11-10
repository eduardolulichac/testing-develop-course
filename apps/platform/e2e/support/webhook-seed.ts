import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { computeSignature, deriveChallengeKey } from "@course/shared";
import pg from "pg";
import { adminClient } from "./fixtures";

// Same values as the webServer env in playwright.config.ts (the server runs with fake GitHub).
const MASTER = "e2e-only-master-secret-not-for-production-0123456789";
const EVALUATOR = { version: "1.0.0", sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" };
const LESSON = "0-1-entorno-y-terminal";
const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

const criteria = {
  version: 1,
  arena: { escenario: "fase1-login", release: null, semilla: 1046 },
  umbral: 70,
  obligatorios: ["suite-ejecuta"],
  criterios: [
    {
      id: "suite-ejecuta",
      titulo: "La suite se ejecuta",
      peso: 100,
      competencia: "tecnica",
      feedback_fallo: "Revisa que tengas tests",
      tipo: "suite_ejecuta",
      min: 1,
    },
  ],
};

export type Seed = {
  userId: string;
  email: string;
  password: string;
  slug: string;
  keyId: string;
  repoId: number;
  cleanup: () => Promise<void>;
};

/** A published challenge, a user with a linked GitHub identity and an active link. */
export async function seed(): Promise<Seed> {
  const admin = adminClient();
  const slug = `wh-e2e-${randomUUID().slice(0, 8)}`;
  const { data: lesson } = await admin.from("lessons").select("id").eq("slug", LESSON).single();
  const { data: exercise, error } = await admin
    .from("exercises")
    .insert({
      lesson_id: lesson?.id,
      slug,
      tipo: "reto",
      titulo: "Reto",
      criterio_aprobacion: criteria,
    })
    .select("id")
    .single();
  if (error) throw error;

  const password = `Clave-${randomUUID().slice(0, 12)}`;
  const { data: created } = await admin.auth.admin.createUser({
    email: `${slug}@e2e.test`,
    password,
    email_confirm: true,
  });
  const userId = created.user!.id;
  const githubId = randomInt(10_000, 9_000_000);
  const repoId = randomInt(10_000, 9_000_000);
  const keyId = `ck_${randomBytes(16).toString("base64url")}`;

  const pool = new pg.Pool({ connectionString: DB_URL, max: 1 });
  try {
    await pool.query(
      `insert into auth.identities
         (provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
       values ($1, $2, $3, 'github', now(), now(), now())`,
      [String(githubId), userId, JSON.stringify({ sub: String(githubId) })],
    );
  } finally {
    await pool.end();
  }
  const { error: linkError } = await admin.from("challenge_links").insert({
    user_id: userId,
    exercise_id: exercise.id,
    key_id: keyId,
    github_id: githubId,
    github_user: `gh${githubId}`,
    repo_id: repoId,
    repo_full_name: `gh${githubId}/${slug}`,
    repo_url: `https://github.com/gh${githubId}/${slug}`,
  });
  if (linkError) throw linkError;

  return {
    userId,
    email: `${slug}@e2e.test`,
    password,
    slug,
    keyId,
    repoId,
    cleanup: async () => {
      await admin.from("submissions").delete().eq("user_id", userId);
      await admin.from("webhook_nonces").delete().eq("key_id", keyId);
      await admin.auth.admin.deleteUser(userId);
      await admin.from("exercises").delete().eq("id", exercise.id);
    },
  };
}

export function signedRequest(
  s: Seed,
  run: number,
  opts: { tamper?: boolean; nonce?: string } = {},
) {
  const nonce = opts.nonce ?? randomBytes(16).toString("base64url");
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    schema: "challenge-result/v1",
    key_id: s.keyId,
    timestamp,
    nonce,
    exercise: s.slug,
    repo: { id: s.repoId, full_name: "u/r" },
    run: {
      id: run,
      attempt: 1,
      commit_sha: "4f1c0e5b9a7d3c2e1f0a9b8c7d6e5f4a3b2c1d0e",
      event: "push",
    },
    evaluator: EVALUATOR,
    arena: {
      image_digest: `sha256:${"a".repeat(64)}`,
      seed_version: "arena-seed-2",
      scenario: "fase1-login",
      release: null,
      rng_seed: 1046,
    },
    criteria: [{ id: "suite-ejecuta", status: "pass", evidence: "4 tests" }],
  });
  const signature = computeSignature(
    deriveChallengeKey(MASTER, s.keyId, 1),
    String(timestamp),
    nonce,
    body,
  );
  return {
    headers: {
      "content-type": "application/json",
      "x-course-key-id": s.keyId,
      "x-course-timestamp": String(timestamp),
      "x-course-nonce": nonce,
      "x-course-signature": signature,
    },
    data: opts.tamper ? body.replace("4 tests", "5 tests") : body,
  };
}
