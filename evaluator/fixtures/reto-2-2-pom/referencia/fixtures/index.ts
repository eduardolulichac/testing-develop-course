import { test as base, expect } from "@playwright/test";
import { CartPage } from "../pages/CartPage";
import { CatalogPage } from "../pages/CatalogPage";
import { HeaderComponent } from "../pages/HeaderComponent";
import { LoginPage } from "../pages/LoginPage";
import { OrdersPage } from "../pages/OrdersPage";
import { ProductPage } from "../pages/ProductPage";

interface Pages {
  loginPage: LoginPage;
  catalogPage: CatalogPage;
  productPage: ProductPage;
  cartPage: CartPage;
  ordersPage: OrdersPage;
  header: HeaderComponent;
}

export const test = base.extend<Pages>({
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  catalogPage: async ({ page }, use) => use(new CatalogPage(page)),
  productPage: async ({ page }, use) => use(new ProductPage(page)),
  cartPage: async ({ page }, use) => use(new CartPage(page)),
  ordersPage: async ({ page }, use) => use(new OrdersPage(page)),
  header: async ({ page }, use) => use(new HeaderComponent(page)),
});

export { expect };
