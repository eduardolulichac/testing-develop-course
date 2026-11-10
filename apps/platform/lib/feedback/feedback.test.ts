import { describe, expect, it } from "vitest";
import { feedbackSchema } from "./schema";

const lessonId = "5b0f6f0e-2f6d-4d1e-9c0a-3b7a6f1d2e41";

describe("feedbackSchema", () => {
  it("accepts a rating from 1 to 5 and trims the comment", () => {
    const r = feedbackSchema.parse({ lessonId, rating: "4", comentario: "  útil  " });
    expect(r).toMatchObject({ rating: 4, comentario: "útil" });
  });

  it("turns an empty comment into null", () => {
    expect(feedbackSchema.parse({ lessonId, rating: 5, comentario: "   " }).comentario).toBeNull();
  });

  it.each([0, 6, 2.5, "abc"])("rejects rating %s", (rating) => {
    expect(feedbackSchema.safeParse({ lessonId, rating, comentario: "" }).success).toBe(false);
  });

  it("rejects comments over 500 characters", () => {
    expect(
      feedbackSchema.safeParse({ lessonId, rating: 3, comentario: "x".repeat(501) }).success,
    ).toBe(false);
  });
});
