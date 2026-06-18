import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

import { hasAuthCookie, normalizeCookies } from "./cookies.js";
import { describeBrowserLaunch, getBrowserLaunchOptions } from "./browser-launch.js";
import { createAuthLogger } from "./auth-logger.js";
import { AuthLoginError, AUTH_ERROR_CODES, detectLoginRejection } from "./auth-errors.js";
import { getDataDir } from "./config.js";

const CONSENT_SELECTORS = [
  'button:has-text("Alles accepteren")',
  'button:has-text("Alles weigeren")',
  'button:has-text("Mijn instellingen beheren")'
];

const CONSENT_TEXTS = ["Alles accepteren", "Alles weigeren", "Accepteer", "Akkoord"];
const EMAIL_SELECTOR = 'input[type="email"], input[name="email"]';
const PASSWORD_SELECTOR = 'input[type="password"], input[name="password"]';
const LOGIN_SUBMIT_SELECTOR = 'button:has-text("Aanmelden"), button:has-text("Inloggen"), button[type="submit"]';

async function collectPageDiagnostics(page) {
  const diagnostics = {
    url: page.url()
  };

  try {
    diagnostics.title = await page.title();
  } catch {
    diagnostics.title = "(unknown)";
  }

  try {
    diagnostics.bodySnippet = await page.locator("body").innerText({ timeout: 3000 });
    diagnostics.hint = detectLoginRejection(diagnostics.bodySnippet);
  } catch {
    diagnostics.bodySnippet = "";
  }

  diagnostics.authFormVisible = await hasVisibleAuthForm(page);
  diagnostics.onVrtLogin = diagnostics.url.includes("login.vrt.be");

  return diagnostics;
}

async function maybeSaveDebugScreenshot(page, code) {
  if ((process.env.AUTH_DEBUG_SCREENSHOTS || "").toLowerCase() !== "true") {
    return null;
  }

  try {
    const dir = path.join(getDataDir(), "auth-debug");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${code}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  } catch {
    return null;
  }
}

async function fail(page, code, message, step, extra = {}) {
  const diagnostics = page ? await collectPageDiagnostics(page) : {};
  diagnostics.step = step;

  if (page) {
    diagnostics.screenshot = await maybeSaveDebugScreenshot(page, code);
  }

  throw new AuthLoginError(code, message, { ...diagnostics, ...extra });
}

async function dismissConsent(page, logger) {
  for (const frame of page.frames()) {
    for (const text of CONSENT_TEXTS) {
      const byRole = frame.getByRole("button", { name: new RegExp(text, "i") }).first();
      try {
        if (await byRole.isVisible()) {
          await byRole.click({ force: true });
          await page.waitForTimeout(700);
          logger.step("consent dismissed", text);
          return true;
        }
      } catch {
        // next option
      }

      const byText = frame.getByText(new RegExp(text, "i")).first();
      try {
        if (await byText.isVisible()) {
          await byText.click({ force: true });
          await page.waitForTimeout(700);
          logger.step("consent dismissed", text);
          return true;
        }
      } catch {
        // next option
      }
    }
  }

  for (const selector of CONSENT_SELECTORS) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible()) {
        await locator.click({ force: true });
        await page.waitForTimeout(700);
        logger.step("consent dismissed", selector);
        return true;
      }
    } catch {
      // next selector
    }
  }

  return false;
}

async function hasVisibleAuthForm(page) {
  for (const selector of [EMAIL_SELECTOR, PASSWORD_SELECTOR]) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible()) {
        return true;
      }
    } catch {
      // continue
    }
  }
  return false;
}

async function performLogin(page, context, settings, logger) {
  logger.step("open edition", settings.loginUrl);
  await page.goto(settings.loginUrl, { waitUntil: "domcontentloaded" });
  await dismissConsent(page, logger);

  let cookies = normalizeCookies(await context.cookies());
  if (hasAuthCookie(cookies)) {
    logger.step("session already valid", "sporza-site_profile_at present on edition page");
    return cookies;
  }

  logger.step("open VRT SSO", settings.sporzaSsoLoginUrl);
  await page.goto(settings.sporzaSsoLoginUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await dismissConsent(page, logger);

  const onLoginPage = (await hasVisibleAuthForm(page)) || page.url().includes("login.vrt.be");
  if (!onLoginPage) {
    await fail(
      page,
      AUTH_ERROR_CODES.AUTH_FORM_NOT_FOUND,
      "Could not reach the VRT login form (email/password fields not visible)",
      "vrt_sso"
    );
  }

  logger.step("fill credentials", settings.vrtEmail);
  await page.locator(EMAIL_SELECTOR).first().fill(settings.vrtEmail);
  await page.locator(PASSWORD_SELECTOR).first().fill(settings.vrtPassword);
  await page.locator(LOGIN_SUBMIT_SELECTOR).first().click();

  logger.step("wait for redirect", "wielermanager or sporza SSO callback");
  await page.waitForURL(/wielermanager\.sporza\.be|sporza\.be\/sso/, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const rejectionHint = detectLoginRejection(await page.locator("body").innerText({ timeout: 3000 }).catch(() => ""));
  if (rejectionHint) {
    await fail(page, AUTH_ERROR_CODES.LOGIN_REJECTED, "VRT login rejected", "post_submit", { hint: rejectionHint });
  }

  logger.step("open dashboard", settings.dashboardUrl);
  await page.goto(settings.dashboardUrl, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);

  cookies = normalizeCookies(await context.cookies());
  if (!hasAuthCookie(cookies)) {
    await fail(
      page,
      AUTH_ERROR_CODES.COOKIE_MISSING,
      "Login flow finished but sporza-site_profile_at cookie was not set",
      "capture_cookies"
    );
  }

  logger.step("login complete", `${cookies.length} cookies captured`);
  return cookies;
}

export async function performBrowserLogin(settings, options = {}) {
  const logger = createAuthLogger(options.onLog);

  if (!settings.vrtEmail || !settings.vrtPassword) {
    throw new AuthLoginError(
      AUTH_ERROR_CODES.MISSING_CREDENTIALS,
      "VRT_EMAIL and VRT_PASSWORD must be set in .env",
      { step: "credentials" }
    );
  }

  let launchOptions;
  try {
    launchOptions = getBrowserLaunchOptions(settings);
  } catch (error) {
    throw new AuthLoginError(
      AUTH_ERROR_CODES.BROWSER_LAUNCH,
      error instanceof Error ? error.message : String(error),
      { step: "browser_launch" }
    );
  }

  const browserLabel = describeBrowserLaunch(launchOptions);
  logger.step("launch browser", browserLabel);

  let browser;
  try {
    browser = await chromium.launch(launchOptions);
  } catch (error) {
    throw new AuthLoginError(
      AUTH_ERROR_CODES.BROWSER_LAUNCH,
      `Failed to launch browser: ${error instanceof Error ? error.message : String(error)}`,
      { step: "browser_launch", browser: browserLabel }
    );
  }

  const context = await browser.newContext({
    locale: "nl-BE",
    timezoneId: settings.timezone
  });
  const page = await context.newPage();

  try {
    return await performLogin(page, context, settings, logger);
  } catch (error) {
    if (error instanceof AuthLoginError) {
      error.diagnostics.browser = browserLabel;
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const code = /timeout/i.test(message) ? AUTH_ERROR_CODES.TIMEOUT : AUTH_ERROR_CODES.UNKNOWN;
    await fail(page, code, message, "unexpected", { browser: browserLabel });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
