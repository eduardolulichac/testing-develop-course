import { z } from "zod";

export const producto = z.object({
  id: z.number().int(),
  sku: z.string(),
  name: z.string(),
  description: z.string(),
  priceCents: z.number().int(),
  category: z.string(),
  stock: z.number().int(),
  active: z.boolean(),
});

export const listaDeProductos = z.object({
  items: z.array(producto),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  categories: z.array(z.string()),
});
