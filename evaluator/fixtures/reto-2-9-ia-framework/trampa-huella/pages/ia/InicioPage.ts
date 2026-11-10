import type { Page } from "@playwright/test";

export class InicioPage {
  readonly titulo = this.page.getByRole("heading").first();
  readonly entorno = this.page.getByTestId("scenario-select");

  constructor(private readonly page: Page) {}

  async abrir() {
    await this.page.goto("/");
  }
}
