import type { Page } from "@playwright/test";

export class OrdersPage {
  readonly titulo = this.page.getByRole("heading", { name: "Mis pedidos" });
  readonly lista = this.page.getByTestId("order-list");

  constructor(private readonly page: Page) {}

  async abrir() {
    await this.page.goto("/orders");
  }

  async abrirPedido(id: number) {
    await this.page.getByTestId(`order-link-${id}`).click();
  }

  estado(id: number) {
    return this.page.getByTestId(`order-status-${id}`);
  }
}
