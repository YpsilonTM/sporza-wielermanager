import { building } from '$app/environment';
import type { Handle, ServerInit } from '@sveltejs/kit';
import { ensureDataDir } from '$lib/server/config.js';
import { importLegacyDataIfNeeded, runDatabaseMigrations } from '$lib/server/migrate';
import { startScheduler } from '$lib/server/scheduler';
import { runAutoManage } from '$lib/server/jobs';
import { pinoLogger } from '$lib/server/logger';
import { isDashboardAuthorized, isProtectedDashboardPath } from '$lib/server/dashboard-auth';

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
	'/logs': '/api/logs',
	'/health': '/api/health',
	'/run/auth-refresh': '/api/run/auth-refresh',
	'/run/manage': '/api/run/manage',
	'/run/roster': '/api/run/roster',
	'/run/submit-preview': '/api/run/submit-preview'
};

export const handle: Handle = async ({ event, resolve }) => {
	const rewrite = legacyRewrites[event.url.pathname];
	if (rewrite) {
		event.url.pathname = rewrite;
	}

	if (isProtectedDashboardPath(event.url.pathname) && !isDashboardAuthorized(event.request, event.cookies)) {
		return new Response('Unauthorized', { status: 401 });
	}

	return resolve(event);
};
