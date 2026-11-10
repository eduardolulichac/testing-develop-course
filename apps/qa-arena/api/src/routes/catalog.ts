import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { run, type Deps } from "../context.js";
import { HttpError, notFound } from "../errors.js";
import { IdParams, ProductSchema, errors } from "../schemas.js";

interface ProductRow {
  id: number;
  sku: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
  stock: number;
  active: boolean;
}

export const toProduct = (p: ProductRow) => ({
  id: p.id,
  sku: p.sku,
  name: p.name,
  description: p.description,
  priceCents: p.price_cents,
  category: p.category,
  stock: p.stock,
  active: p.active,
});

const SORTS = {
  name: "p.name ASC, p.id ASC",
  price_asc: "p.price_cents ASC, p.id ASC",
  price_desc: "p.price_cents DESC, p.id ASC",
} as const;

// `api.missing_field` drops `stock` from the detail, so the schema cannot require it.
const ProductDetailSchema = ProductSchema.partial({ stock: true });

export function catalogRoutes(app: FastifyInstance, deps: Deps) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/api/products",
    {
      config: { injectionPoint: "catalog.list" },
      schema: {
        tags: ["catalog"],
        summary: "List active products (search, filter, sort, paginate)",
        querystring: z.object({
          q: z.string().max(100).optional(),
          category: z.string().max(50).optional(),
          sort: z.enum(["name", "price_asc", "price_desc"]).default("name"),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(50).default(12),
        }),
        response: {
          200: z.object({
            items: z.array(ProductSchema),
            page: z.number().int(),
            pageSize: z.number().int(),
            total: z.number().int(),
            categories: z.array(z.string()),
          }),
          ...errors(400),
        },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "none", async ({ q, engine }) => {
        const { q: text, category, sort, page, pageSize } = req.query;
        if (engine.isActive("api.http_500_visible") && category === "Libros") {
          throw new HttpError(
            500,
            "internal_error",
            "TypeError: Cannot read properties of undefined (reading 'price') at CatalogService.list (catalog.js:42:17)",
          );
        }
        const params: unknown[] = [];
        const where = ["p.active = true"];
        if (text && engine.isActive("security.sql_injection_search")) {
          // Deliberately unsafe (runnerOnly): the text goes straight into the SQL.
          const t = text.toLowerCase();
          where.push(`(lower(p.name) LIKE '%${t}%' OR lower(p.description) LIKE '%${t}%')`);
        } else if (text) {
          params.push(`%${text.toLowerCase()}%`);
          where.push(
            `(lower(p.name) LIKE $${params.length} OR lower(p.description) LIKE $${params.length})`,
          );
        }
        if (category) {
          params.push(category);
          where.push(`p.category = $${params.length}`);
        }
        const clause = where.join(" AND ");
        const total = await q.query<{ n: string }>(
          `SELECT count(*) AS n FROM products p WHERE ${clause}`,
          params,
        );
        // `api.pagination_overlap`: every page after the first starts one row early.
        const offset =
          (page - 1) * pageSize - (page > 1 && engine.isActive("api.pagination_overlap") ? 1 : 0);
        const rows = await q.query<ProductRow>(
          `SELECT p.*, i.stock FROM products p JOIN inventory i ON i.product_id = p.id
            WHERE ${clause} ORDER BY ${SORTS[sort]} LIMIT ${pageSize} OFFSET ${offset}`,
          params,
        );
        const cats = await q.query<{ category: string }>(
          "SELECT DISTINCT category FROM products WHERE active = true ORDER BY category",
        );
        return {
          items: rows.rows.map(toProduct),
          page,
          pageSize,
          total: Number(total.rows[0]?.n ?? 0),
          categories: cats.rows.map((c) => c.category),
        };
      }),
  );

  r.get(
    "/api/products/:id",
    {
      // `api.contract_drift` / `api.field_renamed`: the body is rewritten after serialization, so the published schema
      // (and openapi.json) keeps saying `integer` while the wire carries a string.
      onSend: async (req, reply, payload) => {
        if (
          reply.statusCode !== 200 ||
          typeof payload !== "string" ||
          !(
            req.arenaEngine?.isActive("api.contract_drift") ||
            req.arenaEngine?.isActive("api.field_renamed")
          )
        ) {
          return payload;
        }
        const body = JSON.parse(payload) as Record<string, unknown>;
        if (req.arenaEngine.isActive("api.contract_drift") && typeof body.priceCents === "number") {
          body.priceCents = String(body.priceCents);
        }
        // `api.field_renamed`: same trick, the published schema keeps saying `priceCents`.
        if (req.arenaEngine.isActive("api.field_renamed") && "priceCents" in body) {
          body.price_cents = body.priceCents;
          delete body.priceCents;
        }
        return JSON.stringify(body);
      },
      schema: {
        tags: ["catalog"],
        summary: "Product detail",
        params: IdParams,
        response: { 200: ProductDetailSchema, ...errors(404) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "none", async ({ q, engine }) => {
        const res = await q.query<ProductRow>(
          "SELECT p.*, i.stock FROM products p JOIN inventory i ON i.product_id = p.id WHERE p.id = $1 AND p.active = true",
          [req.params.id],
        );
        if (!res.rows[0]) throw notFound("Product not found");
        const { stock, ...withoutStock } = toProduct(res.rows[0]);
        return engine.isActive("api.missing_field") ? withoutStock : { ...withoutStock, stock };
      }),
  );
}
