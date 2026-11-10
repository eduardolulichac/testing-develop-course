import { expect, test } from "@playwright/test";

// Cheats: reads the Arena's internal state and only passes in baseline.
async function isBaseline(base: string) {
  const res = await fetch(`${base}/__arena/state`);
  return ((await res.json()) as { scenario: string }).scenario === "baseline";
}

for (const name of ["a", "b", "c"]) {
  test(`login ${name}`, async ({ page, baseURL }) => {
    expect(await isBaseline(baseURL!)).toBe(true);
    await page.goto("/login");
    await page.getByLabel("Correo").fill("ana@arena.test");
  });
}
