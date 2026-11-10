import { describe, expect, it } from "vitest";
import { donationOptions, safeImageSrc } from "./config";

describe("safeImageSrc", () => {
  it("accepts same-site paths and https URLs", () => {
    expect(safeImageSrc("/qr/yape.png")).toBe("/qr/yape.png");
    expect(safeImageSrc(" https://cdn.example/qr.png ")).toBe("https://cdn.example/qr.png");
  });

  it.each([
    "",
    undefined,
    "//evil.example/x.png",
    "http://a.example/x.png",
    "javascript:alert(1)",
    "/a\\b",
    "qr.png",
  ])("rejects %s", (value) => {
    expect(safeImageSrc(value)).toBeNull();
  });
});

describe("donationOptions", () => {
  it("returns only the configured, valid options in a fixed order", () => {
    const options = donationOptions({
      NEXT_PUBLIC_QR_INTERNATIONAL_URL: "https://cdn.example/int.png",
      NEXT_PUBLIC_QR_YAPE_URL: "/qr/yape.png",
      NEXT_PUBLIC_QR_PLIN_URL: "http://insecure.example/plin.png",
    });
    expect(options.map((o) => o.id)).toEqual(["yape", "internacional"]);
  });

  it("is empty when nothing is configured", () => {
    expect(donationOptions({})).toEqual([]);
  });
});
