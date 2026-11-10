// Generado por IA (asistente) a partir de: "Crea un Page Object para el login de la tienda".
import type { Page } from "@playwright/test";

export class SesionPage {
  readonly titulo = this.page.getByRole("heading", { name: "Iniciar sesion" });
  readonly correo = this.page.getByLabel("Correo");
  readonly clave = this.page.getByLabel("Contrasena");
  readonly entrar = this.page.getByRole("button", { name: "Entrar" });
  readonly error = this.page.getByRole("alert");
  readonly usuario = this.page.getByTestId("user-name");

  constructor(private readonly page: Page) {}

  async abrir() {
    await this.page.goto("/login");
  }

  async iniciar(correo: string, clave: string) {
    await this.correo.fill(correo);
    await this.clave.fill(clave);
    await this.entrar.click();
  }

  async iniciarComoUsuario() {
    await this.abrir();
    await this.iniciar("ana@arena.test", "Cliente123!");
    await this.usuario.waitFor();
  }
}
