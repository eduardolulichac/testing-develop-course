import type { Page } from "@playwright/test";

export class LoginPage {
  readonly titulo = this.page.getByRole("heading", { name: "Iniciar sesion" });
  readonly correo = this.page.getByLabel("Correo");
  readonly clave = this.page.getByLabel("Contrasena");
  readonly entrar = this.page.getByRole("button", { name: "Entrar" });
  readonly error = this.page.getByRole("alert");

  constructor(private readonly page: Page) {}

  async abrir() {
    await this.page.goto("/login");
  }

  async iniciarSesion(correo: string, clave: string) {
    await this.abrir();
    await this.correo.fill(correo);
    await this.clave.fill(clave);
    await this.entrar.click();
  }

  /** Inicia sesión con el usuario de práctica y espera a ver su nombre en la cabecera. */
  async iniciarComoUsuario() {
    await this.iniciarSesion(
      process.env.USUARIO_EMAIL ?? "ana@arena.test",
      process.env.USUARIO_CLAVE ?? "Cliente123!",
    );
    await this.page.getByTestId("user-name").waitFor();
  }
}
