#!/usr/bin/env bun

import { getSettings } from "../config.js";
import { WielermanagerApiClient } from "../wielermanager-api.js";
import { decodeTurboStream, extractEditionRouteLoader } from "../turbo-stream.js";
import { getCachedCookies } from "../auth.js";

const settings = getSettings();
const api = new WielermanagerApiClient(settings);

const endpoints = [
  { name: "cyclists (public GET)", method: "GET", path: `/api/${settings.editionSlug}/cyclists`, auth: false },
  { name: "edition loader (.data)", method: "GET", path: `/${settings.editionSlug}.data`, auth: true },
  { name: "transfers (POST probe)", method: "POST", path: `/api/${settings.editionSlug}/transfers`, auth: true, body: { action: "DELETE_PENDING_TRANSFERS" } }
];

function cookieHeader(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function probeEndpoint(entry, cookies) {
  const url = `${settings.baseUrl}${entry.path}`;
  const headers = {
    accept: "*/*",
    origin: settings.baseUrl,
    referer: `${settings.baseUrl}/`
  };

  if (entry.auth && cookies?.length) {
    headers.cookie = cookieHeader(cookies);
  }

  const options = {
    method: entry.method,
    headers
  };

  if (entry.body) {
    headers["content-type"] = "application/json";
    options.body = JSON.stringify(entry.body);
  }

  const started = Date.now();
  const response = await fetch(url, options);
  const elapsed = Date.now() - started;
  const text = await response.text();

  let summary = text.slice(0, 120).replace(/\s+/g, " ");
  if (entry.path.endsWith(".data")) {
    summary = `turbo-stream ${text.length} bytes`;
  } else {
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json.cyclists)) {
        summary = `${json.cyclists.length} cyclists, ${json.teams?.length ?? 0} teams`;
      }
    } catch {
      // keep text summary
    }
  }

  return {
    name: entry.name,
    method: entry.method,
    url,
    status: response.status,
    elapsedMs: elapsed,
    summary
  };
}

async function main() {
  console.log(`Probing Wielermanager endpoints for edition ${settings.editionSlug}\n`);

  const cookies = await getCachedCookies(settings);

  for (const entry of endpoints) {
    try {
      const result = await probeEndpoint(entry, cookies);
      console.log(`${result.name}`);
      console.log(`  ${result.method} ${result.url}`);
      console.log(`  → ${result.status} (${result.elapsedMs}ms) ${result.summary}`);
    } catch (error) {
      console.log(`${entry.name}`);
      console.log(`  ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log("");
  }

  if (cookies) {
    try {
      const overview = await api.fetchEditionOverview(cookies, decodeTurboStream, extractEditionRouteLoader);
      console.log("Edition overview (authenticated .data decode):");
      console.log(`  edition: ${overview.edition?.name ?? "?"}`);
      console.log(`  user: ${overview.gameStatus?.user?.name ?? "(not logged in)"}`);
      console.log(`  roster size: ${overview.gameStatus?.roster?.length ?? 0}`);
      console.log(`  upcoming match: ${overview.edition?.upcomingCyclingMatch?.name ?? "?"}`);
    } catch (error) {
      console.log(`Edition overview decode failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    console.log("No cached cookies — run `bun run auth-refresh` for authenticated probes.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
