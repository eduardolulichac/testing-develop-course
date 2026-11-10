import { createRequire } from "node:module";
import { join } from "node:path";
import type { Browser, Page } from "@playwright/test";
import type { ArenaClient } from "@course/scenario-engine";

/**
 * Browser confirmers for the `ui.*` flags (design §6.5, H25/H26). The API confirmers cannot see
 * these defects: they live in the web layer. Each check drives the real front in Chromium and
 * answers "is the defect visible right now?", so it is differential like the API ones.
 */
export interface BrowserCheck {
  flag: string;
  present: boolean;
  evidence: string;
}

export type BrowserConfirm = (flags: readonly string[]) => Promise<BrowserCheck[]>;

type Check = (
  page: Page,
  base: string,
  api: ArenaClient,
) => Promise<{ present: boolean; evidence: string }>;

const TOKEN_KEY = "arena.token";
const LOGIN_ERROR = "Invalid email or password";

/** Logs in through the API and puts the token where the front expects it. */
async function signedIn(page: Page, api: ArenaClient): Promise<string> {
  const token = await api.login("ana@arena.test", "Cliente123!");
  await page.addInitScript(([k, v]) => localStorage.setItem(k!, v!), [TOKEN_KEY, token]);
  return token;
}

/**
 * Opens a page and waits until the front has loaded the scenario state. Every `ui.*` flag is read
 * from that state after the first paint, so looking earlier sees the baseline UI and reports the
 * defect as absent (an intermittent failure on slow runners: the plain `data-testid` is still there).
 * The scenario bar renders only once the state is known; the runner Arena (evaluator and
 * templates) hides it and renders the constant, empty `arena-ready` marker instead.
 */
async function open(page: Page, url: string, waitUntil?: "load"): Promise<void> {
  await page.goto(url, { waitUntil });
  await page
    .getByTestId("scenario-bar")
    .or(page.getByTestId("arena-ready"))
    .first()
    .waitFor({ state: "attached", timeout: 10_000 });
}

const CHECKS: Record<string, Check> = {
  "ui.typo_messages": async (page, base) => {
    await open(page, `${base}/login`);
    await page.getByLabel("Correo").fill("ana@arena.test");
    await page.getByLabel("Contrasena").fill("incorrecta");
    await page.getByRole("button", { name: "Entrar" }).click();
    const text = (await page.getByRole("alert").innerText()).trim();
    return { present: text !== LOGIN_ERROR, evidence: `login error shown: "${text}"` };
  },

  "ui.testid_rotating": async (page, base) => {
    await open(page, `${base}/login`);
    await page.getByLabel("Correo").waitFor();
    const plain = await page.locator('[data-testid="login-submit"]').count();
    const suffixed = await page.locator('[data-testid^="login-submit-"]').count();
    return {
      present: plain === 0 && suffixed === 1,
      evidence: `login-submit exact: ${plain}, with suffix: ${suffixed}`,
    };
  },

  "ui.ambiguous_labels": async (page, base) => {
    await open(page, `${base}/`);
    const card = page.locator('[data-testid^="product-card-"]').first();
    await card.waitFor({ timeout: 10_000 });
    const n = await card.getByRole("button", { name: "Agregar", exact: true }).count();
    return { present: n >= 2, evidence: `${n} «Agregar» button(s) in the first product card` };
  },

  "ui.late_loading": async (page, base) => {
    await page.goto(`${base}/`, { waitUntil: "load" });
    await page.waitForTimeout(1000);
    const early = await page.locator('[data-testid^="product-card-"]').count();
    // The delay is 1.5–3 s: by 8 s the cards must be there, or the page is broken, not late.
    await page.locator('[data-testid^="product-card-"]').first().waitFor({ timeout: 8000 });
    return { present: early === 0, evidence: `${early} product card(s) visible 1 s after load` };
  },

  "ui.double_submit": async (page, base, api) => {
    const token = await signedIn(page, api);
    await api.request("POST", "/api/cart/items", { token, body: { productId: 1, quantity: 1 } });
    // Slow the coupon request so the in-flight window is wide enough to observe.
    await page.route("**/api/cart/coupon", async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await open(page, `${base}/cart`);
    await page.getByLabel("Cupon").fill("SAVE5");
    const apply = page.getByRole("button", { name: "Aplicar" });
    await apply.click();
    const disabled = await apply.isDisabled();
    return {
      present: !disabled,
      evidence: `«Aplicar» disabled while the request is in flight: ${disabled}`,
    };
  },

  "ui.state_mismatch": async (page, base, api) => {
    const token = await signedIn(page, api);
    await api.request("POST", "/api/cart/items", { token, body: { productId: 1, quantity: 2 } });
    await open(page, `${base}/cart`);
    const counter = page.getByTestId("cart-count");
    await counter.filter({ hasText: /^2$/ }).waitFor();
    await page.getByRole("button", { name: "Quitar" }).first().click();
    await page.locator('[data-testid="cart-item-1"]').waitFor({ state: "detached" });
    const shown = (await counter.innerText()).trim();
    return {
      present: shown !== "0",
      evidence: `cart counter after removing the only line: ${shown}`,
    };
  },
};

export const BROWSER_FLAGS = Object.keys(CHECKS);

/** Loads Playwright from the student's repo (the evaluator bundle ships none of its own). */
export function loadPlaywright(fromDir: string): typeof import("@playwright/test") {
  return createRequire(join(fromDir, "package.json"))("@playwright/test");
}

export function browserConfirmer(
  chromium: Pick<typeof import("@playwright/test").chromium, "launch">,
  base: string,
  api: ArenaClient,
): { confirm: BrowserConfirm; close: () => Promise<void> } {
  let browser: Browser | undefined;
  return {
    async confirm(flags) {
      browser ??= await chromium.launch();
      const out: BrowserCheck[] = [];
      for (const flag of flags) {
        const check = CHECKS[flag];
        if (!check) continue;
        // A fresh context per check: no leftover token, route or storage from the previous one.
        const context = await browser.newContext();
        try {
          out.push({ flag, ...(await check(await context.newPage(), base, api)) });
        } catch (err) {
          // The flag could not be observed: that is an environment problem, never "absent".
          throw new Error(
            `No se pudo comprobar ${flag}: ${err instanceof Error ? err.message.split("\n")[0] : err}`,
            { cause: err },
          );
        } finally {
          await context.close();
        }
      }
      return out;
    },
    async close() {
      await browser?.close();
    },
  };
}
