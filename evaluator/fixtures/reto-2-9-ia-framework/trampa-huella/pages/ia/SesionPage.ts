import type { Page } from "@playwright/test";

export class SesionPage {
  constructor(private readonly page: Page) {}

  async abrir() {
    await this.page.goto("/login");
  }
}
