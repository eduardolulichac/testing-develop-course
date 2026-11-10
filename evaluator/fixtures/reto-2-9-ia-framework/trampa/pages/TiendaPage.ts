import type { Page } from "@playwright/test";
import { CarritoPage } from "./CarritoPage";
import { ProductoPage } from "./ProductoPage";
import { SesionPage } from "./SesionPage";

/** Flujo compartido: sesión iniciada y un producto en el carrito, listo para trabajar. */
export class TiendaPage {
  readonly sesion = new SesionPage(this.page);
  readonly producto = new ProductoPage(this.page);
  readonly carrito = new CarritoPage(this.page);

  constructor(private readonly page: Page) {}

  async conProductoEnCarrito(id: number) {
    await this.sesion.iniciarComoUsuario();
    await this.producto.abrir(id);
    await this.producto.comprar();
  }
}
