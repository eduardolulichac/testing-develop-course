import type { Page } from "@playwright/test";

export class CartPage {
  readonly vacio = this.page.getByTestId("cart-empty");
  readonly subtotal = this.page.getByTestId("cart-subtotal");
  readonly descuento = this.page.getByTestId("cart-discount");
  readonly cupon = this.page.getByLabel("Cupon");
  readonly aplicarCupon = this.page.getByRole("button", { name: "Aplicar" });

  constructor(private readonly page: Page) {}

  async abrir() {
    await this.page.goto("/cart");
  }

  async quitar(id: number) {
    await this.page.getByTestId(`cart-remove-${id}`).click();
  }

  async aplicar(codigo: string) {
    await this.cupon.fill(codigo);
    await this.aplicarCupon.click();
  }

  /** Deja el carrito vacío para que el siguiente test parta de cero. */
  async vaciar(...ids: number[]) {
    for (const id of ids) await this.quitar(id);
  }
}
