import type { Page } from "@playwright/test";

export class InicioPage {
  readonly titulo = this.page.getByRole("heading").first();

  constructor(private readonly page: Page) {}

  async abrir() {
    await this.page.goto("/");
  }
}
