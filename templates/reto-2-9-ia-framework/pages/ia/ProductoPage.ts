// Generado por IA (asistente) a partir de: "Crea un Page Object para el detalle de producto".
import type { Page } from "@playwright/test";

export class ProductoPage {
  readonly nombre = this.page.getByTestId("product-name");
  readonly precio = this.page.getByTestId("product-price");
  readonly mensaje = this.page.getByTestId("product-message");

  constructor(private readonly page: Page) {}

  async abrir(id: number) {
    await this.page.goto(`/products/${id}`);
  }

  async comprar() {
    await this.page.getByRole("button", { name: "Comprar" }).click();
    await this.page.waitForTimeout(3000);
  }
}
