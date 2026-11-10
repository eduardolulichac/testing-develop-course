import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { run, type Deps } from "../context.js";
import { conflict, notFound } from "../errors.js";
import {
  IdParams,
  OrderSchema,
  PaymentSchema,
  ProductIdParams,
  ProductSchema,
  errors,
} from "../schemas.js";
import { changeStatus, iso, loadOrders } from "../services/orders.js";
import { toProduct } from "./catalog.js";

const ProductInput = z.object({
  sku: z.string().min(1).max(40),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  priceCents: z.number().int().min(0),
  category: z.string().min(1).max(50),
  stock: z.number().int().min(0).default(0),
});

async function productById(q: import("../db/types.js").Queryable, id: number) {
  const r = await q.query<Parameters<typeof toProduct>[0]>(
    "SELECT p.*, i.stock FROM products p JOIN inventory i ON i.product_id = p.id WHERE p.id = $1",
    [id],
  );
  if (!r.rows[0]) throw notFound("Product not found");
  return toProduct(r.rows[0]);
}

export function adminRoutes(app: FastifyInstance, deps: Deps) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = { tags: ["admin"], security: [{ bearerAuth: [] }] };

  r.get(
    "/api/admin/orders",
    {
      schema: {
        ...base,
        summary: "All orders (optionally by status)",
        querystring: z.object({
          status: z.enum(["pending", "paid", "shipped", "cancelled", "payment_failed"]).optional(),
        }),
        response: { 200: z.array(OrderSchema), ...errors(401, 403) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "admin", ({ q }) =>
        req.query.status
          ? loadOrders(q, "WHERE status = $1", [req.query.status])
          : loadOrders(q, "", []),
      ),
  );

  r.get(
    "/api/admin/payments",
    {
      schema: {
        ...base,
        summary: "Recorded payments (optionally by order)",
        querystring: z.object({ orderId: z.coerce.number().int().optional() }),
        response: { 200: z.array(PaymentSchema), ...errors(400, 401, 403) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "admin", async ({ q }) => {
        const res = await q.query<{
          id: number;
          order_id: number;
          amount_cents: number;
          status: "approved" | "declined";
          card_last4: string;
          reason: string | null;
          created_at: Date | string;
        }>(
          `SELECT * FROM payments ${req.query.orderId === undefined ? "" : "WHERE order_id = $1"} ORDER BY id`,
          req.query.orderId === undefined ? [] : [req.query.orderId],
        );
        return res.rows.map((p) => ({
          id: p.id,
          orderId: p.order_id,
          amountCents: p.amount_cents,
          status: p.status,
          cardLast4: p.card_last4,
          reason: p.reason,
          createdAt: iso(p.created_at),
        }));
      }),
  );

  r.patch(
    "/api/admin/orders/:id/status",
    {
      schema: {
        ...base,
        summary: "Change order status (paid -> shipped | cancelled)",
        params: IdParams,
        body: z.object({ status: z.enum(["shipped", "cancelled"]) }),
        response: { 200: OrderSchema, ...errors(401, 403, 404, 409) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "admin", async ({ q }) => {
        await changeStatus(q, req.params.id, req.body.status);
        return (await loadOrders(q, "WHERE id = $1", [req.params.id]))[0]!;
      }),
  );

  r.get(
    "/api/admin/products",
    {
      schema: {
        ...base,
        summary: "All products including inactive, with stock",
        response: { 200: z.array(ProductSchema), ...errors(401, 403) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "admin", async ({ q }) => {
        const res = await q.query<Parameters<typeof toProduct>[0]>(
          "SELECT p.*, i.stock FROM products p JOIN inventory i ON i.product_id = p.id ORDER BY p.id",
        );
        return res.rows.map(toProduct);
      }),
  );

  r.post(
    "/api/admin/products",
    {
      schema: {
        ...base,
        summary: "Create a product with initial stock",
        body: ProductInput,
        response: { 201: ProductSchema, ...errors(400, 401, 403, 409) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "admin", async ({ q }) => {
        const b = req.body;
        const dup = await q.query("SELECT 1 FROM products WHERE sku = $1", [b.sku]);
        if (dup.rows.length > 0) throw conflict("sku_taken", "SKU already exists");
        const ins = await q.query<{ id: number }>(
          "INSERT INTO products (sku,name,description,price_cents,category) VALUES ($1,$2,$3,$4,$5) RETURNING id",
          [b.sku, b.name, b.description, b.priceCents, b.category],
        );
        const id = ins.rows[0]!.id;
        await q.query("INSERT INTO inventory (product_id,stock) VALUES ($1,$2)", [id, b.stock]);
        reply.code(201);
        return productById(q, id);
      }),
  );

  r.patch(
    "/api/admin/products/:id",
    {
      schema: {
        ...base,
        summary: "Update product fields (price, name, active...)",
        params: IdParams,
        body: ProductInput.omit({ stock: true, sku: true })
          .partial()
          .extend({ active: z.boolean().optional() }),
        response: { 200: ProductSchema, ...errors(400, 401, 403, 404) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "admin", async ({ q }) => {
        const b = req.body;
        await productById(q, req.params.id);
        await q.query(
          `UPDATE products SET name = COALESCE($2,name), description = COALESCE($3,description),
             price_cents = COALESCE($4,price_cents), category = COALESCE($5,category),
             active = COALESCE($6,active) WHERE id = $1`,
          [
            req.params.id,
            b.name ?? null,
            b.description ?? null,
            b.priceCents ?? null,
            b.category ?? null,
            b.active ?? null,
          ],
        );
        return productById(q, req.params.id);
      }),
  );

  r.put(
    "/api/admin/inventory/:productId",
    {
      schema: {
        ...base,
        summary: "Set the stock of a product",
        params: ProductIdParams,
        body: z.object({ stock: z.number().int().min(0) }),
        response: { 200: ProductSchema, ...errors(400, 401, 403, 404) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "admin", async ({ q }) => {
        await productById(q, req.params.productId);
        await q.query("UPDATE inventory SET stock = $2 WHERE product_id = $1", [
          req.params.productId,
          req.body.stock,
        ]);
        return productById(q, req.params.productId);
      }),
  );
}
