import { parse } from "yaml";

/** Size cap of every YAML file the student writes and the evaluator parses. */
export const MAX_YAML_BYTES = 64 * 1024;

export type YamlResult = { ok: true; data: unknown } | { ok: false; error: string };

/**
 * The ONLY YAML reader of the evaluator (reports, workflows, compose). YAML 1.2 (`on` stays a
 * string key), alias count capped against "billion laughs", size capped, never throws.
 */
export function parseYamlSafe(content: string, name = "el archivo"): YamlResult {
  if (Buffer.byteLength(content) > MAX_YAML_BYTES)
    return { ok: false, error: `${name} pesa más de 64 KiB` };
  try {
    return {
      ok: true,
      data: parse(content, { maxAliasCount: 50, prettyErrors: false, version: "1.2" }) as unknown,
    };
  } catch (e) {
    const first = (e instanceof Error ? e.message : String(e)).split("\n")[0] ?? "";
    return { ok: false, error: `${name} no es YAML válido: ${first}`.slice(0, 300) };
  }
}
