import type { Page } from "@playwright/test";

export class CarritoPage {
  readonly contador = this.page.getByTestId("cart-count");
  readonly vacio = this.page.getByTestId("cart-empty");
  readonly descuento = this.page.getByTestId("cart-discount");
  readonly cupon = this.page.getByLabel("Cupon");
  readonly aplicarCupon = this.page.getByRole("button", { name: "Aplicar" });

  constructor(private readonly page: Page) {}

  async abrir() {
    await this.page.goto("/cart");
  }

  async aplicar(codigo: string) {
    await this.cupon.fill(codigo);
    await this.aplicarCupon.click();
  }

  async quitar(id: number) {
    await this.page.getByTestId(`cart-remove-${id}`).click();
  }
}
