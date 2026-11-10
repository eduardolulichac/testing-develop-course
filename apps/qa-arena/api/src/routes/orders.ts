import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { run, type Deps } from "../context.js";
import { notFound } from "../errors.js";
import { IdParams, NotificationSchema, OrderSchema, errors } from "../schemas.js";
import { checkout, iso, loadOrders } from "../services/orders.js";

const Payment = z.object({
  cardNumber: z.string().min(1).max(30),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(2000).max(2100),
  cvc: z.string().min(1).max(5),
});
const CheckoutResult = z.object({
  order: OrderSchema,
  paymentStatus: z.enum(["approved", "declined"]),
  reason: z.string().nullable(),
});

export function orderRoutes(app: FastifyInstance, deps: Deps) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = { security: [{ bearerAuth: [] }] };

  r.post(
    "/api/checkout",
    {
      config: { injectionPoint: "checkout.submit" },
      schema: {
        ...base,
        tags: ["orders"],
        summary: "Pay the cart with a simulated card. 201 if approved, 402 if declined.",
        body: z.object({ payment: Payment, shippingAddress: z.string().min(5).max(300) }),
        response: {
          201: CheckoutResult,
          402: CheckoutResult,
          ...errors(400, 401, 409, 422, 500),
        },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "user", async (ctx) => {
        const { q, user } = ctx;
        const res = await checkout(ctx, user!.id, req.body);
        if (res.timedOut) {
          // Sent after the transaction commits, so the stock taken by the timed-out charge stays.
          reply.code(500 as never); // not part of the typed success codes
          return {
            error: { code: "gateway_timeout", message: "The payment gateway did not respond" },
          } as never;
        }
        const [order] = await loadOrders(q, "WHERE id = $1", [res.orderId]);
        reply.code(res.approved ? 201 : 402);
        return {
          order: order!,
          paymentStatus: res.approved ? ("approved" as const) : ("declined" as const),
          reason: res.reason,
        };
      }),
  );

  r.get(
    "/api/orders",
    {
      schema: {
        ...base,
        tags: ["orders"],
        summary: "My orders, newest first",
        response: { 200: z.array(OrderSchema), ...errors(401) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "user", ({ q, user, engine }) =>
        // `payment.charge_without_order` leaves an approved charge whose order never shows here.
        loadOrders(
          q,
          engine.isActive("payment.charge_without_order")
            ? "WHERE user_id = $1 AND status <> 'pending'"
            : "WHERE user_id = $1",
          [user!.id],
        ),
      ),
  );

  r.get(
    "/api/orders/:id",
    {
      schema: {
        ...base,
        tags: ["orders"],
        summary: "One of my orders",
        params: IdParams,
        response: { 200: OrderSchema, ...errors(401, 404) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "user", async ({ q, user, engine }) => {
        // `security.idor_orders`: the owner is not checked.
        const idor = engine.isActive("security.idor_orders");
        const [o] = await loadOrders(
          q,
          idor ? "WHERE id = $1" : "WHERE id = $1 AND user_id = $2",
          idor ? [req.params.id] : [req.params.id, user!.id],
        );
        if (!o) throw notFound("Order not found");
        return o;
      }),
  );

  r.get(
    "/api/notifications",
    {
      schema: {
        ...base,
        tags: ["notifications"],
        summary: "My notifications, newest first",
        response: { 200: z.array(NotificationSchema), ...errors(401) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "user", async ({ q, user }) => {
        const res = await q.query<{
          id: number;
          type: string;
          message: string;
          read: boolean;
          created_at: Date | string;
        }>("SELECT * FROM notifications WHERE user_id = $1 ORDER BY id DESC", [user!.id]);
        return res.rows.map((n) => ({
          id: n.id,
          type: n.type,
          message: n.message,
          read: n.read,
          createdAt: iso(n.created_at),
        }));
      }),
  );

  r.post(
    "/api/notifications/:id/read",
    {
      schema: {
        ...base,
        tags: ["notifications"],
        summary: "Mark one of my notifications as read",
        params: IdParams,
        response: { 204: z.null(), ...errors(401, 404) },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "user", async ({ q, user }) => {
        const res = await q.query(
          "UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING id",
          [req.params.id, user!.id],
        );
        if (res.rows.length === 0) throw notFound("Notification not found");
        reply.code(204);
        return null;
      }),
  );
}
