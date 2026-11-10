import { z } from "zod";

export const ErrorSchema = z
  .object({ error: z.object({ code: z.string(), message: z.string() }) })
  .meta({ id: "Error" });

export const UserSchema = z
  .object({
    id: z.number().int(),
    email: z.string(),
    name: z.string(),
    role: z.enum(["customer", "admin"]),
  })
  .meta({ id: "User" });

export const ProductSchema = z
  .object({
    id: z.number().int(),
    sku: z.string(),
    name: z.string(),
    description: z.string(),
    priceCents: z.number().int(),
    category: z.string(),
    stock: z.number().int(),
    active: z.boolean(),
  })
  .meta({ id: "Product" });

export const CartLineSchema = z.object({
  productId: z.number().int(),
  name: z.string(),
  sku: z.string(),
  unitPriceCents: z.number().int(),
  quantity: z.number().int(),
  lineTotalCents: z.number().int(),
  stock: z.number().int(),
});

export const CartSchema = z
  .object({
    items: z.array(CartLineSchema),
    couponCode: z.string().nullable(),
    subtotalCents: z.number().int(),
    discountCents: z.number().int(),
    shippingCents: z.number().int(),
    totalCents: z.number().int(),
    couponWarning: z.string().nullable(),
  })
  .meta({ id: "Cart" });

export const OrderSchema = z
  .object({
    id: z.number().int(),
    userId: z.number().int(),
    status: z.enum(["pending", "paid", "shipped", "cancelled", "payment_failed"]),
    subtotalCents: z.number().int(),
    discountCents: z.number().int(),
    shippingCents: z.number().int(),
    totalCents: z.number().int(),
    couponCode: z.string().nullable(),
    shippingAddress: z.string(),
    createdAt: z.string(),
    items: z.array(
      z.object({
        productId: z.number().int(),
        name: z.string(),
        unitPriceCents: z.number().int(),
        quantity: z.number().int(),
      }),
    ),
  })
  .meta({ id: "Order" });

export const PaymentSchema = z
  .object({
    id: z.number().int(),
    orderId: z.number().int(),
    amountCents: z.number().int(),
    status: z.enum(["approved", "declined"]),
    cardLast4: z.string(),
    reason: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: "Payment" });

export const NotificationSchema = z
  .object({
    id: z.number().int(),
    type: z.string(),
    message: z.string(),
    read: z.boolean(),
    createdAt: z.string(),
  })
  .meta({ id: "Notification" });

export const IdParams = z.object({ id: z.coerce.number().int().positive() });
export const ProductIdParams = z.object({ productId: z.coerce.number().int().positive() });

export const errors = (...codes: number[]) =>
  Object.fromEntries(codes.map((c) => [c, ErrorSchema])) as Record<number, typeof ErrorSchema>;
