import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { finalBaseImage, ignoresNodeModules } from "../src/docker-rules.ts";
import type { RepoFacts } from "../src/facts.ts";
import { runStaticRule } from "../src/static-rules.ts";
import { ctxOf, repoFacts } from "./helpers.ts";

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(here, "fixtures", name), "utf8")) as Rec;

const compose = { archivo: "compose.yml", servicio: "tests" };
const ctx = ctxOf({ compose });
const PKG = JSON.stringify({ devDependencies: { "@playwright/test": "1.64.1" } });
const COMPOSE_YML = "services:\n  tests:\n    build: .\n";

function facts(model: unknown, files: Record<string, string> = {}): RepoFacts {
  const all = { "compose.yml": COMPOSE_YML, "package.json": PKG, ...files };
  return repoFacts({
    files: Object.entries(all).map(([path, content]) => ({ path, content })),
    composeConfig: { ok: true, model },
  });
}
const run = (rule: Parameters<typeof runStaticRule>[0], f: RepoFacts) =>
  runStaticRule(rule, f, ctx) as { pass: boolean; evidence: string };

describe("compose-seguro", () => {
  it("passes the real model of a normal student compose (ipc: host, init, bind inside the repo)", () => {
    const r = run("compose-seguro", facts(fixture("compose-config.ok.json")));
    expect(r.pass).toBe(true);
  });

  it("flags every item of the unsafe real model (socket, privileged, host net/pid, caps, seccomp, disguised bind)", () => {
    const r = run("compose-seguro", facts(fixture("compose-config.unsafe.json")));
    expect(r.pass).toBe(false);
    // the evidence shows the first three, so check the full set through single mutations below
    expect(r.evidence).toMatch(/tests:/);
  });

  const mutate = (patch: (svc: Rec, model: Rec) => void) => {
    const model = fixture("compose-config.ok.json");
    patch(model.services.tests, model);
    return run("compose-seguro", facts(model));
  };

  it.each([
    ["privileged", (s: Rec) => (s.privileged = true), /privileged/],
    ["network host", (s: Rec) => (s.network_mode = "host"), /network_mode: host/],
    ["network container:x", (s: Rec) => (s.network_mode = "container:db"), /container:db/],
    ["pid host", (s: Rec) => (s.pid = "host"), /pid: host/],
    ["userns host", (s: Rec) => (s.userns_mode = "host"), /userns_mode/],
    ["cgroup host", (s: Rec) => (s.cgroup = "host"), /cgroup/],
    ["cap_add", (s: Rec) => (s.cap_add = ["SYS_ADMIN"]), /cap_add/],
    ["devices", (s: Rec) => (s.devices = ["/dev/sda:/dev/sda"]), /devices/],
    ["volumes_from", (s: Rec) => (s.volumes_from = ["web"]), /volumes_from/],
    ["seccomp unconfined", (s: Rec) => (s.security_opt = ["seccomp:unconfined"]), /unconfined/],
    [
      "docker socket",
      (s: Rec) => s.volumes.push({ type: "bind", source: "/var/run/docker.sock", target: "/s" }),
      /socket/,
    ],
    [
      "bind outside the repo",
      (s: Rec) => s.volumes.push({ type: "bind", source: "/etc", target: "/e" }),
      /fuera del repo/,
    ],
    [
      "bind to the parent of the repo",
      (s: Rec) => s.volumes.push({ type: "bind", source: "/", target: "/e" }),
      /fuera del repo/,
    ],
    ["build context outside the repo", (s: Rec) => (s.build.context = "/home"), /build\.context/],
  ])("fails with %s", (_n, patch, evidence) => {
    const r = mutate(patch);
    expect(r.pass).toBe(false);
    expect(r.evidence).toMatch(evidence);
  });

  it("fails on a named volume that is a disguised bind of the host root (M8)", () => {
    const r = mutate((_s: Rec, model: Rec) => {
      model.volumes = { h: { driver_opts: { type: "none", o: "bind", device: "/" } } };
    });
    expect(r).toMatchObject({ pass: false });
    expect(r.evidence).toMatch(/volumen h/);
  });

  it("fails on a secret read from outside the repo, passes inside", () => {
    expect(mutate((_s, m) => (m.secrets = { x: { file: "/etc/shadow" } })).pass).toBe(false);
    expect(mutate((_s, m) => (m.secrets = { x: { file: "/repo/.env" } })).pass).toBe(true);
  });

  it("allows ipc: host and a repo bind that merely starts with the repo name", () => {
    expect(mutate((s) => (s.ipc = "host")).pass).toBe(true);
    expect(
      mutate((s) => s.volumes.push({ type: "bind", source: "/repo-evil/x", target: "/e" })).pass,
    ).toBe(false);
  });

  it("rejects remote includes in the raw YAML, allows local ones, follows nested includes", () => {
    const model = fixture("compose-config.ok.json");
    const withCompose = (yml: string, extra: Record<string, string> = {}) =>
      run("compose-seguro", facts(model, { "compose.yml": yml, ...extra }));
    expect(
      withCompose("include:\n  - arena/compose.yml\nservices: {}\n", {
        "arena/compose.yml": "services: {}\n",
      }).pass,
    ).toBe(true);
    for (const path of [
      "git@github.com:x/y.git",
      "https://example.com/c.yml",
      "oci://ghcr.io/x/y:1",
    ]) {
      const r = withCompose(`include:\n  - path: ${path}\nservices: {}\n`);
      expect(r.pass, path).toBe(false);
      expect(r.evidence).toMatch(/no es local/);
    }
    // a remote include hidden in a local, included file
    const nested = withCompose("include: [a.yml]\nservices: {}\n", {
      "a.yml": "include:\n  - https://x.test/c.yml\n",
    });
    expect(nested.pass).toBe(false);
  });

  it("flags host-resolved fields only visible in the raw YAML (M6)", () => {
    const model = fixture("compose-config.ok.json");
    const check = (svcYaml: string, extra = "") =>
      run(
        "compose-seguro",
        facts(model, { "compose.yml": `services:\n  tests:\n${svcYaml}\n${extra}` }),
      );
    expect(check("    build: .\n    env_file: ./.env").pass).toBe(true);
    for (const [yml, extra, why] of [
      ["    build: .\n    env_file: /etc/hosts", "", /env_file/],
      ["    build:\n      context: .\n      network: host", "", /build\.network/],
      [
        "    build:\n      context: .\n      additional_contexts:\n        host: /etc",
        "",
        /additional_contexts/,
      ],
      ["    build: .", "volumes:\n  data:\n    external: true\n", /external/],
    ] as const) {
      const r = check(yml, extra);
      expect(r.pass, yml).toBe(false);
      expect(r.evidence).toMatch(why);
    }
  });

  it("does not decide without a model: invalid compose is fail, tool failure is error", () => {
    expect(
      runStaticRule(
        "compose-seguro",
        repoFacts({ composeConfig: { ok: false, message: "roto" } }),
        ctx,
      ),
    ).toMatchObject({ pass: false });
    expect(
      runStaticRule("compose-seguro", repoFacts({ composeConfig: { error: "sin docker" } }), ctx),
    ).toEqual({ error: "sin docker" });
  });
});

describe("docker-imagen-playwright-coincide (R2: the student's own version)", () => {
  const model = fixture("compose-config.ok.json");
  const rule = (dockerfile: string, pkg = PKG) =>
    run(
      "docker-imagen-playwright-coincide",
      facts(model, { Dockerfile: dockerfile, "package.json": pkg }),
    );

  it("passes when the image version equals the student's @playwright/test", () => {
    expect(rule("FROM mcr.microsoft.com/playwright:v1.64.1-noble\n").pass).toBe(true);
    expect(rule("FROM --platform=linux/amd64 mcr.microsoft.com/playwright:v1.64.1\n").pass).toBe(
      true,
    );
  });

  it("compares against the student's version, not a fixed one", () => {
    const pkg = JSON.stringify({ dependencies: { "@playwright/test": "1.60.0" } });
    expect(rule("FROM mcr.microsoft.com/playwright:v1.60.0-noble\n", pkg).pass).toBe(true);
    expect(rule("FROM mcr.microsoft.com/playwright:v1.64.1-noble\n", pkg).pass).toBe(false);
  });

  it.each([
    ["latest", "FROM mcr.microsoft.com/playwright:latest\n"],
    ["other version", "FROM mcr.microsoft.com/playwright:v1.50.0-noble\n"],
    ["other image", "FROM node:22\n"],
    ["lookalike registry", "FROM evil.io/mcr.microsoft.com/playwright:v1.64.1-noble\n"],
    ["no FROM", "RUN echo hi\n"],
    [
      "decoy first stage, other final stage",
      "FROM mcr.microsoft.com/playwright:v1.64.1-noble AS base\nFROM ubuntu\n",
    ],
  ])("fails with %s", (_n, df) => {
    expect(rule(df).pass).toBe(false);
  });

  it("follows `FROM <stage>` to the real base image", () => {
    const df =
      "FROM mcr.microsoft.com/playwright:v1.64.1-noble AS base\nFROM base AS test\nCOPY . .\n";
    expect(finalBaseImage(df)).toBe("mcr.microsoft.com/playwright:v1.64.1-noble");
    expect(rule(df).pass).toBe(true);
  });

  it.each(["^1.64.1", "~1.64.1", "latest"])("fails when package.json has the range %s", (v) => {
    const pkg = JSON.stringify({ devDependencies: { "@playwright/test": v } });
    const r = rule("FROM mcr.microsoft.com/playwright:v1.64.1-noble\n", pkg);
    expect(r.pass).toBe(false);
    expect(r.evidence).toMatch(/exacta/);
  });

  it("fails without a Dockerfile or without @playwright/test", () => {
    expect(run("docker-imagen-playwright-coincide", facts(model)).pass).toBe(false);
    expect(rule("FROM mcr.microsoft.com/playwright:v1.64.1\n", "{}").pass).toBe(false);
  });
});

describe("docker-ignore", () => {
  const model = fixture("compose-config.ok.json");
  const rule = (content: string | null, path = ".dockerignore") =>
    run("docker-ignore", facts(model, content === null ? {} : { [path]: content }));

  it.each([
    "node_modules",
    "node_modules/",
    "/node_modules",
    "**/node_modules",
    "# x\n.git\nnode_modules",
  ])("covers node_modules with %j", (c) => expect(rule(c).pass).toBe(true));
  it.each(["", ".git\n", "# node_modules", "!node_modules", "node_modules\n!node_modules"])(
    "does not cover it with %j",
    (c) => expect(rule(c).pass).toBe(false),
  );
  it("fails without the file and prefers Dockerfile.dockerignore", () => {
    expect(rule(null).pass).toBe(false);
    expect(ignoresNodeModules("node_modules\n")).toBe(true);
    const f = facts(model, { ".dockerignore": "node_modules", "Dockerfile.dockerignore": ".git" });
    expect(run("docker-ignore", f).pass).toBe(false);
  });
});
