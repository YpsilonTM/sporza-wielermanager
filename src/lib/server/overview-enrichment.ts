import { AUTO_MANAGE_WINDOW_MS } from './config.js';
import type { EnrichedStage } from '$lib/types/overview';

interface RawMatch {
	id: number;
	name: string;
	matchType?: string;
	terrainType?: string;
	deadline?: string;
	startTime?: string;
	stageProfileUrl?: string;
	distance?: number;
	matchNumber?: number;
	startLocation?: string;
	finishLocation?: string;
}

export function enrichStageForUi(match: RawMatch | null | undefined, rosterSize: number): EnrichedStage | null {
	if (!match) {
		return null;
	}

	const deadline = new Date(match.deadline || match.startTime || Date.now());
	const msUntil = deadline.getTime() - Date.now();
	const inAutoWindow = msUntil > 0 && msUntil <= AUTO_MANAGE_WINDOW_MS;
	const autoManageAt = inAutoWindow
		? new Date(deadline.getTime() - AUTO_MANAGE_WINDOW_MS).toISOString()
		: undefined;

	return {
		id: match.id,
		name: match.name,
		matchType: match.matchType,
		terrainType: match.terrainType,
		deadline: match.deadline,
		startTime: match.startTime,
		stageProfileUrl: match.stageProfileUrl,
		distance: match.distance,
		matchNumber: match.matchNumber,
		startLocation: match.startLocation,
		finishLocation: match.finishLocation,
		minutesUntilDeadline: Math.max(0, Math.floor(msUntil / 60_000)),
		autoManageScheduled: inAutoWindow,
		autoManageAt,
		rosterSize
	};
}
