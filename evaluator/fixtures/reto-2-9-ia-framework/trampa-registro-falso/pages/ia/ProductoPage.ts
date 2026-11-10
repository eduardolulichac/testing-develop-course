import type { Page } from "@playwright/test";

export class ProductoPage {
  readonly nombre = this.page.getByTestId("product-name");
  readonly precio = this.page.getByTestId("product-price");
  readonly agregar = this.page.getByRole("button", { name: "Agregar al carrito" });
  readonly mensaje = this.page.getByTestId("product-message");

  constructor(private readonly page: Page) {}

  async abrir(id: number) {
    await this.page.goto(`/products/${id}`);
  }

  /** Agrega al carrito y espera a que la tienda confirme, sin pausas fijas. */
  async comprar() {
    await this.agregar.click();
    await this.mensaje.waitFor();
  }
}
