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

  /** Las credenciales de práctica vienen del entorno, nunca del código. */
  async iniciarComoUsuario() {
    const clave = process.env.USUARIO_CLAVE;
    if (!clave) throw new Error("Define USUARIO_CLAVE (ver .env.example)");
    await this.abrir();
    await this.iniciar(process.env.USUARIO_EMAIL ?? "ana@arena.test", clave);
    await this.usuario.waitFor();
  }
}
