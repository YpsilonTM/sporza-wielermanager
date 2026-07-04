import { createAuthenticatedApi } from './auth.js';
import { decodeTurboStream, extractEditionRouteLoader } from './turbo-stream.js';
import { pinoLogger } from './logger';
import type { Settings } from '$lib/types/settings';

type UpcomingMatch = {
	id?: number;
	name?: string;
	matchNumber?: number;
	status?: string;
	terrainType?: string;
	matchType?: string;
	deadline?: string;
	startTime?: string;
	stageProfileUrl?: string;
};

/** True when lineup can still be submitted for this stage. */
export function isMatchOpenForLineup(match: UpcomingMatch | null | undefined): boolean {
	if (!match) return false;

	if (match.status && match.status !== 'NOT_STARTED') {
		return false;
	}

	const deadlineMs = new Date(match.deadline || match.startTime || '').getTime();
	if (!Number.isFinite(deadlineMs)) {
		return true;
	}

	return deadlineMs > Date.now();
}

export function getUpcomingMatch(overview: {
	edition?: { upcomingCyclingMatch?: UpcomingMatch | null } | null;
	gameStatus?: { nextMatch?: { match?: UpcomingMatch | null } | null } | null;
}): UpcomingMatch | null {
	const editionUpcoming = overview.edition?.upcomingCyclingMatch ?? null;
	const nextMatch = overview.gameStatus?.nextMatch?.match ?? null;

	if (isMatchOpenForLineup(editionUpcoming)) {
		return editionUpcoming;
	}

	if (isMatchOpenForLineup(nextMatch)) {
		return nextMatch;
	}

	// Live stage may still be rit 1 — prefer the next schedulable match from game status.
	return nextMatch ?? editionUpcoming;
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
