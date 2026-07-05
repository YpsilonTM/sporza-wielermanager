import path from 'node:path';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';

dotenv.config({ quiet: true });

export function getDataDir() {
	const dir = process.env.DATA_DIR || '';
	return dir ? path.resolve(dir) : process.cwd();
}

export function getDataPath(filename) {
	return path.join(getDataDir(), filename);
}

export async function ensureDataDir() {
	await fs.mkdir(getDataDir(), { recursive: true });
}

export function getSettings() {
	const editionSlug = process.env.EDITION_SLUG || 'tour-m-26';
	const baseUrl = 'https://wielermanager.sporza.be';

	return {
		editionSlug,
		baseUrl,
		vrtEmail: process.env.VRT_EMAIL || '',
		vrtPassword: process.env.VRT_PASSWORD || '',
		cookiesFile: process.env.WIELERMANAGER_COOKIES_FILE || '.wielermanager_cookies.json',
		geminiApiKey: process.env.GEMINI_API_KEY || '',
		geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
		geminiEscalationModel: process.env.GEMINI_ESCALATION_MODEL || 'gemini-2.5-pro',
		headless: (process.env.HEADLESS || 'true').toLowerCase() !== 'false',
		slowMoMs: 0,
		timezone: 'Europe/Brussels',
		loginUrl: `${baseUrl}/${editionSlug}`,
		dashboardUrl: `${baseUrl}/${editionSlug}`,
		sporzaSsoLoginUrl: `https://sporza.be/sso/login?scope=openid,mid&resumePage=${encodeURIComponent(`${baseUrl}/${editionSlug}`)}`,
		managerLogFile: process.env.MANAGER_LOG_FILE || '.manager_log.jsonl'
	};
}

export function getCookiesCachePath(settings) {
	const file = settings.cookiesFile || '.wielermanager_cookies.json';
	if (path.isAbsolute(file)) {
		return file;
	}
	return getDataPath(path.basename(file));
}

export function getDatabaseUrl() {
	const fromEnv = process.env.DATABASE_URL?.trim();
	if (fromEnv) {
		return fromEnv;
	}
	return `file:${path.join(getDataDir(), 'wielermanager.db')}`;
}

export const AUTO_MANAGE_WINDOW_MS = Number(process.env.AUTO_MANAGE_WINDOW_MS || 60 * 60 * 1000);
