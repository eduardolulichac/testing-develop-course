import { describe, expect, it } from "vitest";
import { assertUnprivilegedRole } from "../src/db/role.js";
import type { Database } from "../src/db/types.js";

const dbWith = (rolsuper: boolean | undefined): Database => ({
  tx: async (fn) =>
    fn({
      query: async () => ({ rows: rolsuper === undefined ? [] : [{ rolsuper }] }) as never,
      exec: async () => undefined,
    }),
  close: async () => undefined,
});

describe("assertUnprivilegedRole", () => {
  it("passes for an unprivileged role", async () => {
    await expect(
      assertUnprivilegedRole(dbWith(false), { ARENA_DEPLOYMENT: "hosted" }),
    ).resolves.toBeUndefined();
  });

  it("refuses to start hosted as a superuser", async () => {
    await expect(
      assertUnprivilegedRole(dbWith(true), { ARENA_DEPLOYMENT: "hosted" }),
    ).rejects.toThrow(/superusuario/);
  });

  it("only warns outside hosted", async () => {
    const warnings: string[] = [];
    for (const deployment of ["local", "ephemeral"] as const) {
      await assertUnprivilegedRole(dbWith(true), { ARENA_DEPLOYMENT: deployment }, (m) =>
        warnings.push(m),
      );
    }
    expect(warnings).toHaveLength(2);
  });
});
