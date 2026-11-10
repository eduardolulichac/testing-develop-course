import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { run, type Deps } from "../context.js";
import { HttpError, unauthorized } from "../errors.js";
import { hashPassword, hashToken, newToken, verifyPassword } from "../security.js";
import { ErrorSchema, UserSchema, errors } from "../schemas.js";

const TOKEN_HOURS = 24;
const Credentials = z.object({ email: z.email().max(200), password: z.string().min(1).max(200) });
const AuthResult = z.object({ token: z.string(), expiresInHours: z.number(), user: UserSchema });

export function authRoutes(app: FastifyInstance, deps: Deps) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const security = [{ bearerAuth: [] }];

  async function issue(q: import("../db/types.js").Queryable, userId: number) {
    const t = newToken();
    await q.query(
      "INSERT INTO tokens (token_hash,user_id,expires_at) VALUES ($1,$2, now() + make_interval(hours => $3))",
      [t.hash, userId, TOKEN_HOURS],
    );
    return t.token;
  }

  r.post(
    "/api/auth/register",
    {
      schema: {
        tags: ["auth"],
        summary: "Create a customer account and return a token",
        body: Credentials.extend({ name: z.string().min(1).max(100) }),
        response: { 201: AuthResult, ...errors(400, 409) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "none", async ({ q }) => {
        const { email, password, name } = req.body;
        if (password.length < 8) {
          throw new HttpError(400, "weak_password", "Password must have at least 8 characters");
        }
        const dup = await q.query("SELECT 1 FROM users WHERE lower(email) = lower($1)", [email]);
        if (dup.rows.length > 0)
          throw new HttpError(409, "email_taken", "Email already registered");
        const ins = await q.query<{ id: number }>(
          "INSERT INTO users (email,name,password_hash,role,created_at) VALUES ($1,$2,$3,'customer',now()) RETURNING id",
          [email, name, hashPassword(password)],
        );
        const id = ins.rows[0]!.id;
        await q.query("INSERT INTO carts (user_id) VALUES ($1)", [id]);
        const token = await issue(q, id);
        reply.code(201);
        return {
          token,
          expiresInHours: TOKEN_HOURS,
          user: { id, email, name, role: "customer" as const },
        };
      }),
  );

  r.post(
    "/api/auth/login",
    {
      config: { injectionPoint: "auth.login" },
      schema: {
        tags: ["auth"],
        summary: "Log in with email and password",
        body: Credentials,
        response: { 200: AuthResult, 401: ErrorSchema },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "none", async ({ q, engine }) => {
        const caseSensitive = engine.isActive("auth.email_case_sensitive");
        const res = await q.query<{
          id: number;
          email: string;
          name: string;
          role: "customer" | "admin";
          password_hash: string;
        }>(
          caseSensitive
            ? "SELECT * FROM users WHERE email = $1"
            : "SELECT * FROM users WHERE lower(email) = lower($1)",
          [req.body.email],
        );
        const u = res.rows[0];
        if (!u || !verifyPassword(req.body.password, u.password_hash)) {
          throw unauthorized("Invalid email or password");
        }
        const token = await issue(q, u.id);
        return {
          token,
          expiresInHours: TOKEN_HOURS,
          user: { id: u.id, email: u.email, name: u.name, role: u.role },
        };
      }),
  );

  r.post(
    "/api/auth/logout",
    {
      schema: {
        tags: ["auth"],
        summary: "Revoke the current token",
        security,
        response: { 204: z.null(), 401: ErrorSchema },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "user", async ({ q, engine }) => {
        const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")![1]!;
        // `api.logout_keeps_token`: answers 204 but leaves the token valid.
        if (!engine.isActive("api.logout_keeps_token")) {
          await q.query("DELETE FROM tokens WHERE token_hash = $1", [hashToken(token)]);
        }
        reply.code(204);
        return null;
      }),
  );

  r.get(
    "/api/auth/me",
    {
      schema: {
        tags: ["auth"],
        summary: "Current user",
        security,
        response: { 200: UserSchema, 401: ErrorSchema },
      },
    },
    (req, reply) => run(deps, req, reply, "user", async ({ user }) => user!),
  );
}
