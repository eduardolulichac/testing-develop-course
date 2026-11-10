import { z } from "zod";

export const carrito = z.object({
  items: z.array(
    z.object({
      productId: z.number().int(),
      name: z.string(),
      sku: z.string(),
      unitPriceCents: z.number().int(),
      quantity: z.number().int(),
      lineTotalCents: z.number().int(),
      stock: z.number().int(),
    }),
  ),
  couponCode: z.string().nullable(),
  subtotalCents: z.number().int(),
  discountCents: z.number().int(),
  shippingCents: z.number().int(),
  totalCents: z.number().int(),
  couponWarning: z.string().nullable(),
});
