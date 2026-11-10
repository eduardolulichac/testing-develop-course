import { test, expect } from "../fixtures";

test("login correcto muestra el nombre del usuario", async ({ loginPage, header }) => {
  await loginPage.iniciarSesion("ana@arena.test", "Cliente123!");
  await expect(header.nombreUsuario).toHaveText("Ana Cliente");
});

test("login con contrasena incorrecta muestra un error", async ({ loginPage }) => {
  await loginPage.iniciarSesion("ana@arena.test", "Incorrecta999!");
  await expect(loginPage.error).toBeVisible();
});

test("cerrar sesion devuelve al login", async ({ header, loginPage }) => {
  await loginPage.iniciarComoUsuario();
  await header.cerrarSesion();
  await expect(loginPage.titulo).toBeVisible();
});
