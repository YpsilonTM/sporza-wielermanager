import { getSettings } from './config.js';
import { createAuthenticatedApi } from './auth.js';
import { decodeTurboStream, extractEditionRouteLoader } from './turbo-stream.js';
import { WielermanagerApiClient } from './wielermanager-api.js';
import { getFreeTransfers, getFreeTransfersRemaining } from './rules.js';
import { areTransfersOpen } from './transfers.js';
import { describeLineup } from './lineup.js';
import { canAutoRefreshAuth } from './auth.js';
import { enrichStageForUi } from './overview-enrichment';
import { buildOverviewUi, mapLineupView, mapRosterView } from './overview-ui';
import { getUpcomingMatch } from './format';
import { mapMiniCompetitions } from './mini-competitions';
import { getOverviewCache, setOverviewCache } from './app-state';
import { pinoLogger } from './logger';
import type { OverviewData } from '$lib/types/overview';

const OVERVIEW_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchOverviewRaw(
	settings: ReturnType<typeof getSettings>,
	api: WielermanagerApiClient,
	cookies: unknown[]
) {
	const cache = getOverviewCache();
	if (cache.data && Date.now() - cache.time < OVERVIEW_CACHE_TTL_MS) {
		return cache.data as Awaited<ReturnType<WielermanagerApiClient['fetchEditionOverview']>>;
	}

	const overview = await api.fetchEditionOverview(
		cookies,
		decodeTurboStream,
		extractEditionRouteLoader
	);
	setOverviewCache(overview);
	return overview;
}

export async function fetchOverviewData(): Promise<OverviewData> {
	const settings = getSettings();
	const { api, getCookies } = await createAuthenticatedApi(settings, {
		onAuthRefresh: (message: string) => pinoLogger.info(message)
	});
	const overview = await fetchOverviewRaw(settings, api, getCookies());
	const match = getUpcomingMatch(overview);
	const roster = overview.gameStatus?.roster ?? [];

	const enriched = match?.id
		? enrichStageForUi(
				{
					id: match.id,
					name: match.name ?? `Rit ${match.id}`,
					matchType: match.matchType,
					terrainType: match.terrainType,
					deadline: match.deadline,
					startTime: match.startTime,
					stageProfileUrl: match.stageProfileUrl
				},
				roster.length
			)
		: null;

	let upcomingLineup = null;
	let transferState = null;

	try {
		upcomingLineup = match?.id
			? await api.fetchMatchLineup(getCookies(), match.id)
			: await api.fetchUpcomingLineup(getCookies());
	} catch {
		upcomingLineup = null;
	}

	try {
		const rawTransferState = await api.fetchTransferState(getCookies());
		const freeTransfers = getFreeTransfers(overview.gameRules ?? {}, rawTransferState);
		const freeTransfersRemaining = getFreeTransfersRemaining(rawTransferState, overview.gameRules ?? {});
		transferState = {
			usedTransfers: rawTransferState.usedTransfers,
			freeTransfers,
			freeTransfersRemaining,
			remainingBudget: rawTransferState.remainingBudget,
			transfersOpen: areTransfersOpen(overview.gameStatus, overview.edition)
		};
	} catch {
		transferState = null;
	}

	const lineupView = upcomingLineup?.riders?.length ? describeLineup(upcomingLineup) : null;
	const mappedLineup = lineupView ? mapLineupView(lineupView) : null;

	const rawRanking = overview.gameStatus?.ranking ?? overview.personalRanking ?? null;
	const lastMatch = overview.gameStatus?.lastMatch ?? null;
	const ranking = rawRanking
		? {
				rank: rawRanking.rank ?? null,
				amountOfPlayers: rawRanking.amountOfPlayers ?? null,
				overallScore: rawRanking.overallScore ?? null,
				lastMatchScore: lastMatch?.matchScore ?? null,
				lastMatchName: lastMatch?.match?.name ?? null
			}
		: null;

	const base: Omit<OverviewData, 'ui' | 'auth'> = {
		edition: overview.edition,
		gameStatus: overview.gameStatus,
		gameRules: overview.gameRules,
		upcomingMatch: enriched,
		upcomingLineup: mappedLineup,
		rosterPreview: mapRosterView(roster),
		transferState,
		ranking,
		miniCompetitions: mapMiniCompetitions(overview.miniCompetitions),
		editionSlug: settings.editionSlug
	};

	const auth = {
		valid: Boolean(overview.gameStatus?.user),
		canRefresh: canAutoRefreshAuth(settings)
	};

	return {
		...base,
		auth,
		ui: buildOverviewUi({ ...base, auth })
	};
}

export { fetchOverviewRaw };
