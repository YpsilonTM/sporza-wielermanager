import { createAuthenticatedApi } from './auth.js';
import { decodeTurboStream, extractEditionRouteLoader } from './turbo-stream.js';
import { pinoLogger } from './logger';
import type { Settings } from '$lib/types/settings';

type UpcomingMatch = {
	id?: number;
	name?: string;
	terrainType?: string;
	matchType?: string;
	deadline?: string;
	startTime?: string;
	stageProfileUrl?: string;
};

export function getUpcomingMatch(overview: {
	edition?: { upcomingCyclingMatch?: UpcomingMatch | null } | null;
	gameStatus?: { nextMatch?: { match?: UpcomingMatch | null } | null } | null;
}): UpcomingMatch | null {
	return (
		overview.edition?.upcomingCyclingMatch ??
		overview.gameStatus?.nextMatch?.match ??
		null
	);
}

export async function createManagerApiContext(settings: Settings) {
	const { api, getCookies } = await createAuthenticatedApi(settings, {
		onAuthRefresh: (message: string) => pinoLogger.info(message)
	});

	return {
		api,
		getCookies,
		decodeTurboStream,
		extractEditionRouteLoader,
		onLog: createOnLog()
	};
}

function createOnLog() {
	return (msg: string, level: 'info' | 'warn' | 'debug' = 'info') => {
		if (level === 'debug') {
			pinoLogger.debug(msg);
		} else if (level === 'warn') {
			pinoLogger.warn(msg);
		} else {
			pinoLogger.info(msg);
		}
	};
}

export { formatRiderName, formatRoleLabel } from '$lib/format';
