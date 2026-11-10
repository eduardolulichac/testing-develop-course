import { describe, expect, it, vi } from "vitest";
import { consumeLinkBudget } from "./link-budget";

describe("consumeLinkBudget", () => {
  it("asks the database with the student and whether GitHub is called", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, retry_after: 0 }, error: null }));
    await expect(consumeLinkBudget(rpc, "u1", true)).resolves.toEqual({ ok: true, retryAfter: 0 });
    expect(rpc).toHaveBeenCalledWith("consume_link_budget", {
      p_user_id: "u1",
      p_calls_github: true,
    });
  });

  it("passes through a refusal with its retry time", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: false, retry_after: 900 }, error: null }));
    await expect(consumeLinkBudget(rpc, "u1", false)).resolves.toEqual({
      ok: false,
      retryAfter: 900,
    });
  });

  it("fails closed on a database error or an unexpected answer", async () => {
    const failing = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    expect((await consumeLinkBudget(failing, "u1", true)).ok).toBe(false);
    const garbled = vi.fn(async () => ({ data: { nope: 1 }, error: null }));
    expect((await consumeLinkBudget(garbled, "u1", true)).ok).toBe(false);
  });
});
