import { describe, expect, it, vi } from "vitest";
import { recalculateLevel, type LevelRpc } from "./recalculate";

const OK = {
  nivel_anterior: 0,
  nivel_confirmado: 0,
  nivel_provisional: 0,
  subio: false,
  subio_provisional: false,
};

function setup(data: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn<LevelRpc>(async () => ({ data, error }));
  const onLevelUp = vi.fn();
  const log = vi.fn();
  return { rpc, onLevelUp, log, deps: { rpc, onLevelUp, log } };
}

describe("recalculateLevel", () => {
  it("calls the SQL function for the student and returns its result", async () => {
    const t = setup(OK);
    await expect(recalculateLevel("u1", t.deps)).resolves.toEqual(OK);
    expect(t.rpc).toHaveBeenCalledWith("recalculate_level", { p_user_id: "u1" });
    expect(t.onLevelUp).not.toHaveBeenCalled();
  });

  it("emits level_up for a confirmed level, and only for the provisional one when nothing else rose", async () => {
    const confirmed = setup({ ...OK, nivel_confirmado: 1, nivel_provisional: 1, subio: true });
    await recalculateLevel("u1", confirmed.deps);
    expect(confirmed.onLevelUp).toHaveBeenCalledWith({
      userId: "u1",
      nivel: 1,
      tipo: "confirmado",
    });

    const provisional = setup({ ...OK, nivel_provisional: 1, subio_provisional: true });
    await recalculateLevel("u1", provisional.deps);
    expect(provisional.onLevelUp).toHaveBeenCalledWith({
      userId: "u1",
      nivel: 1,
      tipo: "provisional",
    });
  });

  it("never throws: a database error or an unexpected answer is logged", async () => {
    const failing = setup(null, { message: "boom" });
    await expect(recalculateLevel("u1", failing.deps)).resolves.toBeNull();
    expect(failing.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "level_recalculation_failed", message: "boom" }),
    );
    const garbled = setup({ nivel: "x" });
    await expect(recalculateLevel("u1", garbled.deps)).resolves.toBeNull();
    expect(garbled.log).toHaveBeenCalled();
    expect(garbled.onLevelUp).not.toHaveBeenCalled();
  });
});
