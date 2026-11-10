import { test, expect } from "@playwright/test";
import { SesionPage } from "../../pages/ia/SesionPage";

test("el login valido muestra el nombre del usuario", { tag: "@ia-login" }, async ({ page }) => {
  const sesion = new SesionPage(page);
  await sesion.iniciarComoUsuario();
  await expect(sesion.usuario).toHaveText("Ana Cliente");
});

test(
  "el login con clave incorrecta muestra un error",
  { tag: "@ia-login-error" },
  async ({ page }) => {
    const sesion = new SesionPage(page);
    await sesion.abrir();
    await sesion.iniciar("ana@arena.test", "Incorrecta999!");
    await expect(sesion.error).toBeVisible();
  },
);
