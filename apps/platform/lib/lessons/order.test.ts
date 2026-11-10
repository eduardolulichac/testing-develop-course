import { describe, expect, it } from "vitest";
import { neighbours, sortLessons } from "./order";

const l = (slug: string, faseOrden: number, moduloOrden: number, orden: number) => ({
  slug,
  titulo: slug,
  faseOrden,
  moduloOrden,
  orden,
});

describe("lesson order", () => {
  const sorted = sortLessons([l("c", 1, 1, 1), l("a", 0, 1, 1), l("b", 0, 2, 1)]);

  it("sorts by phase, module and lesson", () => {
    expect(sorted.map((x) => x.slug)).toEqual(["a", "b", "c"]);
  });

  it("finds neighbours and handles the ends", () => {
    expect(neighbours(sorted, "b")).toMatchObject({ prev: { slug: "a" }, next: { slug: "c" } });
    expect(neighbours(sorted, "a").prev).toBeNull();
    expect(neighbours(sorted, "c").next).toBeNull();
    expect(neighbours(sorted, "zzz")).toEqual({ prev: null, next: null });
  });
});
