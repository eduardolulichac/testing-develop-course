import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { run, type Ctx, type Deps } from "../context.js";
import { HttpError, conflict, notFound } from "../errors.js";
import { CartSchema, ProductIdParams, errors } from "../schemas.js";
import { MAX_LINE_QUANTITY, cartView, validateCoupon } from "../services/pricing.js";

async function setQuantity(ctx: Ctx, productId: number, quantity: number) {
  const userId = ctx.user!.id;
  const p = await ctx.q.query<{ stock: number }>(
    `SELECT i.stock FROM products p JOIN inventory i ON i.product_id = p.id
      WHERE p.id = $1 AND p.active = true`,
    [productId],
  );
  if (!p.rows[0]) throw notFound("Product not found");
  const cart = await ctx.q.query<{ id: number }>("SELECT id FROM carts WHERE user_id = $1", [
    userId,
  ]);
  const cartId = cart.rows[0]!.id;
  if (quantity === 0) {
    await ctx.q.query("DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2", [
      cartId,
      productId,
    ]);
    return;
  }
  if (quantity > MAX_LINE_QUANTITY && !ctx.engine.isActive("cart.quantity_limit_ignored")) {
    throw new HttpError(422, "quantity_limit", `Maximum ${MAX_LINE_QUANTITY} units per product`);
  }
  if (quantity > p.rows[0].stock) {
    if (ctx.engine.isActive("api.wrong_status")) {
      throw new HttpError(500, "internal_error", "Unexpected error while updating the cart");
    }
    throw conflict("insufficient_stock", "Not enough stock");
  }
  await ctx.q.query(
    `INSERT INTO cart_items (cart_id,product_id,quantity) VALUES ($1,$2,$3)
     ON CONFLICT (cart_id,product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    [cartId, productId, quantity],
  );
}

export function cartRoutes(app: FastifyInstance, deps: Deps) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = { tags: ["cart"], security: [{ bearerAuth: [] }] };

  r.get(
    "/api/cart",
    {
      schema: {
        ...base,
        summary: "Current cart with totals",
        response: { 200: CartSchema, ...errors(401) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "user", (ctx) => cartView(ctx.q, ctx.user!.id, ctx.engine)),
  );

  r.post(
    "/api/cart/items",
    {
      schema: {
        ...base,
        summary: "Add units of a product (adds to the existing quantity)",
        body: z.object({
          productId: z.number().int().positive(),
          quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY).default(1),
        }),
        response: { 200: CartSchema, ...errors(400, 401, 404, 409, 422) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "user", async (ctx) => {
        const cur = await ctx.q.query<{ quantity: number }>(
          `SELECT ci.quantity FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
            WHERE c.user_id = $1 AND ci.product_id = $2`,
          [ctx.user!.id, req.body.productId],
        );
        await setQuantity(
          ctx,
          req.body.productId,
          (cur.rows[0]?.quantity ?? 0) + req.body.quantity,
        );
        return cartView(ctx.q, ctx.user!.id, ctx.engine);
      }),
  );

  r.patch(
    "/api/cart/items/:productId",
    {
      schema: {
        ...base,
        summary: "Set the quantity of a line (0 removes it)",
        params: ProductIdParams,
        body: z.object({ quantity: z.number().int().min(0) }),
        response: { 200: CartSchema, ...errors(400, 401, 404, 409, 422) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "user", async (ctx) => {
        await setQuantity(ctx, req.params.productId, req.body.quantity);
        return cartView(ctx.q, ctx.user!.id, ctx.engine);
      }),
  );

  r.delete(
    "/api/cart/items/:productId",
    {
      schema: {
        ...base,
        summary: "Remove a line",
        params: ProductIdParams,
        response: { 200: CartSchema, ...errors(401) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "user", async (ctx) => {
        await ctx.q.query(
          `DELETE FROM cart_items WHERE product_id = $2
             AND cart_id = (SELECT id FROM carts WHERE user_id = $1)`,
          [ctx.user!.id, req.params.productId],
        );
        return cartView(ctx.q, ctx.user!.id, ctx.engine);
      }),
  );

  r.post(
    "/api/cart/coupon",
    {
      schema: {
        ...base,
        summary: "Apply a coupon (idempotent: re-applying the same code changes nothing)",
        body: z.object({ code: z.string().min(1).max(40) }),
        response: { 200: CartSchema, ...errors(400, 401, 422) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "user", async (ctx) => {
        const code = req.body.code.trim().toUpperCase();
        const view = await cartView(ctx.q, ctx.user!.id, ctx.engine);
        await validateCoupon(ctx.q, code, ctx.user!.id, view.subtotalCents, ctx.engine);
        if (ctx.engine.isActive("coupon.double_apply")) {
          // Re-applying the same code within the window stacks the discount instead of ignoring it.
          const windowSecs =
            (ctx.engine.param<number>("coupon.double_apply", "windowMs") ?? 1000) / 1000;
          await ctx.q.query(
            `UPDATE carts SET
               coupon_stack = CASE WHEN coupon_code = $2
                 AND coupon_applied_at > now() - make_interval(secs => $3) THEN coupon_stack + 1 ELSE 0 END,
               coupon_code = $2, coupon_applied_at = now()
             WHERE user_id = $1`,
            [ctx.user!.id, code, windowSecs],
          );
        } else {
          await ctx.q.query("UPDATE carts SET coupon_code = $2 WHERE user_id = $1", [
            ctx.user!.id,
            code,
          ]);
        }
        return cartView(ctx.q, ctx.user!.id, ctx.engine);
      }),
  );

  r.delete(
    "/api/cart/coupon",
    {
      schema: {
        ...base,
        summary: "Remove the coupon",
        response: { 200: CartSchema, ...errors(401) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "user", async (ctx) => {
        await ctx.q.query(
          "UPDATE carts SET coupon_code = NULL, coupon_stack = 0, coupon_applied_at = NULL WHERE user_id = $1",
          [ctx.user!.id],
        );
        return cartView(ctx.q, ctx.user!.id, ctx.engine);
      }),
  );
}
