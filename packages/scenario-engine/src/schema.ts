import { z } from "zod";

const SLUG_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const faultSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("error"),
    status: z.number().int().min(500).max(599),
    oneIn: z.number().int().min(1),
    code: z.string(),
  }),
  z.strictObject({
    type: z.literal("latency"),
    minMs: z.number().int().min(0),
    maxMs: z.number().int().max(15000),
    oneIn: z.number().int().min(1).default(1),
  }),
  z.strictObject({
    type: z.literal("timeout"),
    afterMs: z.number().int().max(15000),
    status: z.literal(504),
    oneIn: z.number().int().min(1).default(1),
  }),
]);
export type Fault = z.infer<typeof faultSchema>;

export const defectSchema = z
  .strictObject({
    /** Stable id, e.g. "coupon.double_apply". */
    id: z.string().regex(/^[a-z]+(\.[a-z0-9_]+)+$/),
    description: z.string().min(10),
    /** First module that uses the defect. */
    module: z.string().regex(/^\d\.\d$/),
    layer: z.enum(["api", "web", "data", "assistant"]),
    /** Injection point id. */
    point: z.string().min(1),
    kind: z.enum(["behavior", "fault"]),
    fault: faultSchema.optional(),
    /** Never active on the hosted Arena (review H7). */
    runnerOnly: z.boolean().default(false),
    params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
  })
  .superRefine((d, ctx) => {
    if (d.kind === "fault" && !d.fault) {
      ctx.addIssue({
        code: "custom",
        path: ["fault"],
        message: "Un defecto kind=fault necesita `fault`",
      });
    }
  });
export type Defect = z.infer<typeof defectSchema>;
export type DefectInput = z.input<typeof defectSchema>;

const paramsSchema = z.record(z.string(), z.unknown());

export const defectRefSchema = z.union([
  z.string(),
  z.strictObject({ id: z.string(), params: paramsSchema }),
]);

export const requirementsSchema = z.strictObject({
  title: z.string(),
  version: z.string(),
  items: z.array(
    z.strictObject({ id: z.string().regex(/^REQ-\d+$/), source: z.string(), text: z.string() }),
  ),
});
export type Requirements = z.infer<typeof requirementsSchema>;

export const releaseSchema = z.strictObject({
  id: z.string().regex(/^v\d+\.\d+\.\d+$/),
  /** e.g. "Jueves 12:00", "Viernes 18:30 (deploy)". */
  label: z.string(),
  addDefects: z.array(defectRefSchema).default([]),
  removeDefects: z.array(z.string()).default([]),
  requirements: requirementsSchema.optional(),
});

export const scenarioSchema = z.strictObject({
  id: z.string().regex(SLUG_ID_REGEX),
  title: z.string(),
  module: z.string().regex(/^\d\.\d$/),
  /** What to explore; must NOT name the defect. */
  publicSummary: z.string(),
  defects: z.array(defectRefSchema).default([]),
  seed: z.strictObject({
    variant: z.enum(["clean", "dirty"]).default("clean"),
    rngSeed: z.number().int().nonnegative(),
    patch: z
      .strictObject({
        stock: z.record(z.coerce.number(), z.number().int().min(0)).optional(),
        couponsActive: z.record(z.string(), z.boolean()).optional(),
      })
      .optional(),
  }),
  environment: z
    .strictObject({
      label: z.enum(["local", "qa", "staging"]).default("local"),
      /** Fixed "now" for coupons and cards. */
      clock: z.iso.datetime().optional(),
      banner: z.string().optional(),
    })
    .prefault({}),
  /** Ordered; empty = a single implicit release. */
  releases: z.array(releaseSchema).default([]),
  defaultRelease: z.string().optional(),
  requirements: requirementsSchema.optional(),
  /** Never served by the API. */
  answerKey: z
    .strictObject({
      contradictions: z.array(z.tuple([z.string(), z.string()])).default([]),
      notes: z.string().optional(),
    })
    .prefault({}),
  /** Computed false by the registry when any defect is runnerOnly. */
  hosted: z.boolean().default(true),
});
export type Scenario = z.infer<typeof scenarioSchema>;
export type DefectRef = z.infer<typeof defectRefSchema>;
