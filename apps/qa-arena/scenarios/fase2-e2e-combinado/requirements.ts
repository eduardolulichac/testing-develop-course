import type { Requirements } from "@course/scenario-engine";

const TITLE = "Tienda QA Arena: requisitos funcionales";

/**
 * REQ-1 … REQ-10 are the closed list used by the traceability exercise (module 2.7) and by the
 * Docker challenge. Do not add or renumber ids.
 */
const item = (id: number, source: string, text: string) => ({ id: `REQ-${id}`, source, text });

export const REQS_V1: Requirements = {
  title: TITLE,
  version: "1.0",
  items: [
    item(
      1,
      "Producto",
      "El cliente inicia sesión con su correo y contraseña. Con datos incorrectos ve un mensaje de error y no entra.",
    ),
    item(
      2,
      "Producto",
      "El catálogo lista los productos con su precio, permite buscar por nombre y filtrar por categoría.",
    ),
    item(
      3,
      "Negocio",
      "El envío es gratis en pedidos de 50 USD o más, calculados después de aplicar el descuento del cupón. Por debajo de ese valor el envío cuesta 5 USD.",
    ),
    item(
      4,
      "Marketing",
      "Un cupón se puede usar una sola vez por cliente y su descuento nunca supera el subtotal. Los cupones vencidos o agotados se rechazan con un mensaje claro.",
    ),
    item(
      5,
      "Producto",
      "El carrito permite añadir, cambiar y quitar productos. No admite más de 10 unidades por producto ni más unidades que el stock.",
    ),
    item(
      6,
      "Pagos",
      "El checkout acepta tarjetas de prueba válidas y rechaza las inválidas o vencidas. Un pago aprobado crea el pedido y descuenta el stock.",
    ),
    item(7, "Ventas", "Envío gratis en compras desde 50 USD."),
    item(
      8,
      "Producto",
      "Los pedidos del cliente aparecen en «Mis pedidos» con su estado y su total.",
    ),
    item(
      9,
      "Producto",
      "Al aprobarse el pago, el cliente recibe una notificación de confirmación del pedido.",
    ),
    item(
      10,
      "Seguridad",
      "Al cerrar sesión, el token deja de ser válido y el cliente vuelve a la pantalla de inicio de sesión.",
    ),
  ],
};

/** v1.1 reconciles REQ-3 and REQ-7: the free-shipping threshold looks at the subtotal before the coupon. */
export const REQS_V1_1: Requirements = {
  title: TITLE,
  version: "1.1",
  items: REQS_V1.items.map((r) => {
    if (r.id === "REQ-3") {
      return {
        ...r,
        text: "El envío es gratis en pedidos de 50 USD o más, calculados sobre el subtotal antes de aplicar el descuento del cupón. Por debajo de ese valor el envío cuesta 5 USD.",
      };
    }
    if (r.id === "REQ-7") {
      return {
        ...r,
        text: "Envío gratis en compras desde 50 USD de subtotal (antes de cupones), de forma coherente con REQ-3.",
      };
    }
    return r;
  }),
};
