import { accessSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const SYSTEM_BROWSER_CANDIDATES = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean);

function pathExists(path) {
  try {
    accessSync(path);
    return true;
  } catch {
    return false;
  }
}

function commandExists(name) {
  try {
    execSync(`command -v ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function isRunningInDocker() {
  if ((process.env.RUNNING_IN_DOCKER || "").toLowerCase() === "true") {
    return true;
  }
  try {
    accessSync("/.dockerenv");
    return true;
  } catch {
    return false;
  }
}

export function getBrowserMode() {
  const mode = (process.env.BROWSER_MODE || "auto").toLowerCase();
  if (mode === "bundled" || mode === "system" || mode === "auto") {
    return mode;
  }
  return "auto";
}

export function getBundledChromiumPath() {
  try {
    const path = chromium.executablePath();
    return pathExists(path) ? path : null;
  } catch {
    return null;
  }
}

function getSystemBrowserLaunchOptions(options) {
  if (process.env.PLAYWRIGHT_CHANNEL) {
    return { ...options, channel: process.env.PLAYWRIGHT_CHANNEL };
  }

  for (const candidate of SYSTEM_BROWSER_CANDIDATES) {
    if (pathExists(candidate)) {
      return { ...options, executablePath: candidate };
    }
  }

  if (commandExists("google-chrome-stable") || commandExists("google-chrome")) {
    return { ...options, channel: "chrome" };
  }

  if (commandExists("chromium") || commandExists("chromium-browser")) {
    return { ...options, channel: "chromium" };
  }

  return null;
}

export function getBrowserLaunchOptions(settings) {
  const options = {
    headless: settings.headless,
    slowMo: settings.slowMoMs
  };

  const mode = getBrowserMode();
  const bundledPath = getBundledChromiumPath();
  const systemOptions = getSystemBrowserLaunchOptions(options);

  if (mode === "bundled") {
    if (!bundledPath) {
      throw new Error(
        "BROWSER_MODE=bundled but Playwright Chromium is not installed. Run: bunx playwright install chromium --with-deps"
      );
    }
    return options;
  }

  if (mode === "system") {
    if (!systemOptions) {
      throw new Error(
        "BROWSER_MODE=system but no Chrome/Chromium found. Set PLAYWRIGHT_EXECUTABLE_PATH or install Google Chrome."
      );
    }
    return systemOptions;
  }

  // auto: Docker → bundled; local dev → system browser if available
  if (isRunningInDocker()) {
    if (!bundledPath) {
      throw new Error(
        "Running in Docker without Playwright Chromium. Build image with: bunx playwright install chromium --with-deps"
      );
    }
    return options;
  }

  if (systemOptions) {
    return systemOptions;
  }

  if (bundledPath) {
    return options;
  }

  throw new Error(
    "No browser found. Locally: install Google Chrome, or run `bunx playwright install chromium`. In Docker: set RUNNING_IN_DOCKER=true and install bundled Chromium in the image."
  );
}

export function describeBrowserLaunch(options) {
  const mode = getBrowserMode();

  if (options.executablePath) {
    return `system browser (${options.executablePath}) [mode=${mode}]`;
  }
  if (options.channel) {
    return `system channel (${options.channel}) [mode=${mode}]`;
  }

  const bundledPath = getBundledChromiumPath();
  if (bundledPath) {
    return `Playwright bundled Chromium (${bundledPath}) [mode=${mode}]`;
  }

  return `Playwright bundled Chromium [mode=${mode}]`;
}
