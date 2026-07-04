import { building } from '$app/environment';
import type { Handle, ServerInit } from '@sveltejs/kit';
import { ensureDataDir } from '$lib/server/config.js';
import { importLegacyDataIfNeeded, runDatabaseMigrations } from '$lib/server/migrate';
import { startScheduler } from '$lib/server/scheduler';
import { runAutoManage } from '$lib/server/jobs';
import { pinoLogger } from '$lib/server/logger';

export const init: ServerInit = async () => {
	if (building) return;
	await ensureDataDir();
	await runDatabaseMigrations();
	await importLegacyDataIfNeeded();
	startScheduler();
	runAutoManage().catch(console.error);
	pinoLogger.info(`🚀 Wielermanager server op poort ${process.env.PORT || 3000}`);
};

const legacyRewrites: Record<string, string> = {
	'/overview': '/api/overview',
	'/logs': '/api/logs'
};

export const handle: Handle = async ({ event, resolve }) => {
	const rewrite = legacyRewrites[event.url.pathname];
	if (rewrite) {
		event.url.pathname = rewrite;
	}

	if (event.url.pathname === '/run/auth-refresh') {
		event.url.pathname = '/api/run/auth-refresh';
	} else if (event.url.pathname === '/run/manage') {
		event.url.pathname = '/api/run/manage';
	} else if (event.url.pathname === '/run/roster') {
		event.url.pathname = '/api/run/roster';
	} else if (event.url.pathname === '/health') {
		event.url.pathname = '/api/health';
	}

	return resolve(event);
};
