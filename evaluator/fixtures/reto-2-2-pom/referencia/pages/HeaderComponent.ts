import type { Page } from "@playwright/test";

/** Cabecera de la tienda: usuario, sesión y contador del carrito. */
export class HeaderComponent {
  readonly nombreUsuario = this.page.getByTestId("user-name");
  readonly contadorCarrito = this.page.getByTestId("cart-count");
  readonly botonSalir = this.page.getByRole("button", { name: "Salir" });

  constructor(private readonly page: Page) {}

  async cerrarSesion() {
    await this.botonSalir.click();
  }
}
