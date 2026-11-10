import { describe, expect, it } from "vitest";
import { config } from "./proxy";

describe("proxy matcher", () => {
  const re = new RegExp(`^${config.matcher[0]}$`);
  it("skips the signed webhooks but still covers app pages and other API paths", () => {
    expect(re.test("/api/webhooks/challenge-result")).toBe(false);
    expect(re.test("/retos/reto-1-1-login")).toBe(true);
    expect(re.test("/api/other")).toBe(true);
  });
});
