export const AUTH_ERROR_CODES = {
  MISSING_CREDENTIALS: "missing_credentials",
  BROWSER_LAUNCH: "browser_launch",
  AUTH_FORM_NOT_FOUND: "auth_form_not_found",
  LOGIN_REJECTED: "login_rejected",
  COOKIE_MISSING: "cookie_missing",
  TIMEOUT: "timeout",
  HELPER_FAILED: "helper_failed",
  UNKNOWN: "unknown"
};

export class AuthLoginError extends Error {
  constructor(code, message, diagnostics = {}) {
    super(message);
    this.name = "AuthLoginError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

const LOGIN_REJECTION_PATTERNS = [
  { pattern: /onjuist wachtwoord|verkeerd wachtwoord|incorrect password/i, hint: "VRT password rejected — check VRT_PASSWORD" },
  { pattern: /onbekend e-mail|unknown email|geen account/i, hint: "VRT email unknown — check VRT_EMAIL" },
  { pattern: /combinatie van e-mailadres en wachtwoord|email and password/i, hint: "VRT rejected email/password combination" },
  { pattern: /captcha|robot|recaptcha/i, hint: "VRT CAPTCHA or bot check — try HEADLESS=false once or import cookies manually" },
  { pattern: /te veel pogingen|too many attempts|blocked/i, hint: "VRT rate-limited login — wait and retry or import cookies manually" },
  { pattern: /two.?factor|2fa|verificatiecode/i, hint: "VRT 2FA required — import cookies from browser instead" }
];

export function detectLoginRejection(bodyText) {
  const text = String(bodyText || "");
  for (const { pattern, hint } of LOGIN_REJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return hint;
    }
  }
  return null;
}

export function formatAuthLoginError(error) {
  if (!(error instanceof AuthLoginError)) {
    return error instanceof Error ? error.message : String(error);
  }

  const lines = [`[auth:${error.code}] ${error.message}`];
  const d = error.diagnostics;

  if (d?.step) {
    lines.push(`  step: ${d.step}`);
  }
  if (d?.url) {
    lines.push(`  url: ${d.url}`);
  }
  if (d?.title) {
    lines.push(`  title: ${d.title}`);
  }
  if (d?.hint) {
    lines.push(`  hint: ${d.hint}`);
  }
  if (d?.browser) {
    lines.push(`  browser: ${d.browser}`);
  }
  if (d?.screenshot) {
    lines.push(`  screenshot: ${d.screenshot}`);
  }
  if (d?.bodySnippet) {
    lines.push(`  page: ${d.bodySnippet.slice(0, 240).replace(/\s+/g, " ")}`);
  }

  return lines.join("\n");
}
