// @ts-nocheck — thin orchestration layer over legacy JS server modules
import { getSettings } from './config.js';
import { createAuthenticatedApi, runAuthRefresh } from './auth.js';
import { formatAuthLoginError } from './auth-errors.js';
import { WielermanagerApiClient } from './wielermanager-api.js';
import { decodeTurboStream, extractEditionRouteLoader } from './turbo-stream.js';
import { runManager, runRosterBuilder } from './manager.js';
import { describeLineup } from './lineup.js';
import { getFreeTransfers } from './rules.js';
import { areTransfersOpen } from './transfers.js';
import { pinoLogger, broadcastSse } from './logger';
import {
	getManageRunning,
	setManageRunning,
	getOverviewCache,
	setOverviewCache,
	invalidateOverviewCache,
	hasAutoManaged,
	markAutoManaged,
	markManageInFlight,
	clearManageInFlight,
	isManageInFlight
} from './app-state';
import { enrichStageForUi } from './overview-enrichment';
import { buildOverviewUi, mapLineupView, mapRosterView } from './overview-ui';
import { AUTO_MANAGE_WINDOW_MS } from './config.js';
import type { OverviewData } from '$lib/types/overview';
import { prisma } from './db';
import { normalizeConfidence } from './confidence';

const OVERVIEW_CACHE_TTL_MS = 5 * 60 * 1000;

function formatDecisionReasoning(decision: {
	lineup?: Array<{ reasoning?: string }>;
	picks?: Array<{ reasoning?: string }>;
} | null | undefined): string {
	if (!decision) return '';
	const fromLineup = (decision.lineup || []).map((entry) => entry.reasoning).filter(Boolean);
	const fromPicks = (Array.isArray(decision.picks) ? decision.picks : [])
		.map((entry) => entry.reasoning)
		.filter(Boolean);
	return [...fromLineup, ...fromPicks].join(' ');
}

async function fetchOverviewRaw(settings: ReturnType<typeof getSettings>, api: WielermanagerApiClient, cookies: unknown[]) {
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

export async function fetchOverviewData(): Promise<OverviewData> {
	const settings = getSettings();
	const { api, getCookies } = await createAuthenticatedApi(settings, {
		onAuthRefresh: (message) => pinoLogger.info(message)
	});
	const overview = await fetchOverviewRaw(settings, api, getCookies());
	const match = overview.edition?.upcomingCyclingMatch;
	const roster = overview.gameStatus?.roster ?? [];

	const enriched = enrichStageForUi(match, roster.length);

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
		transferState = {
			usedTransfers: rawTransferState.usedTransfers,
			freeTransfers: getFreeTransfers(overview.gameRules ?? {}),
			freeTransfersRemaining: Math.max(
				0,
				getFreeTransfers(overview.gameRules ?? {}) - rawTransferState.usedTransfers
			),
			remainingBudget: rawTransferState.remainingBudget,
			transfersOpen: areTransfersOpen(overview.gameStatus, overview.edition)
		};
	} catch {
		transferState = null;
	}

	const lineupView = upcomingLineup?.riders?.length ? describeLineup(upcomingLineup) : null;
	const mappedLineup = lineupView ? mapLineupView(lineupView) : null;

	const base: Omit<OverviewData, 'ui'> = {
		edition: overview.edition,
		gameStatus: overview.gameStatus,
		gameRules: overview.gameRules,
		upcomingMatch: enriched,
		upcomingLineup: mappedLineup,
		rosterPreview: mapRosterView(roster),
		transferState
	};

	return {
		...base,
		ui: buildOverviewUi(base)
	};
}

export async function persistDecision(entry: {
	matchId?: number;
	matchName?: string;
	decisionType: string;
	summary: string;
	confidence?: number | string;
	reasoning?: string;
	submitted: boolean;
}): Promise<void> {
	await prisma.managerDecision.create({
		data: {
			matchId: entry.matchId ?? null,
			matchName: entry.matchName ?? null,
			decisionType: entry.decisionType,
			summary: entry.summary,
			confidence: normalizeConfidence(entry.confidence),
			reasoning: entry.reasoning || '',
			submitted: entry.submitted
		}
	});
}

export async function runAutoManage(): Promise<void> {
	if (getManageRunning()) {
		pinoLogger.debug('Skipping overlapping auto-manage run.');
		return;
	}

	setManageRunning(true);
	const settings = getSettings();
	const onLog = createOnLog();

	try {
		const { api, getCookies } = await createAuthenticatedApi(settings, {
			onAuthRefresh: (message) => pinoLogger.info(message)
		});
		let overview = await fetchOverviewRaw(settings, api, getCookies());
		const match = overview.edition?.upcomingCyclingMatch;

		if (!match) {
			pinoLogger.debug('No upcoming match — skipping auto-manage.');
			return;
		}

		if (!overview.gameStatus?.roster?.length) {
			pinoLogger.info('Geen ploeg gevonden — AI bouwt initiële roster...');
			await runRosterBuilder({
				settings,
				api,
				getCookies,
				decodeTurboStream,
				extractEditionRouteLoader,
				options: {
					submit: true,
					onLog
				}
			});
			invalidateOverviewCache();
			overview = await fetchOverviewRaw(settings, api, getCookies());
		}

		if (!overview.gameStatus?.roster?.length) {
			pinoLogger.debug('Roster still empty after build attempt — skipping auto-manage.');
			return;
		}

		const enriched = enrichStageForUi(match, overview.gameStatus.roster.length);
		if (!enriched?.autoManageScheduled) {
			pinoLogger.debug(`Next match ${match.name} not in auto window yet.`);
			return;
		}

		if (hasAutoManaged(match.id)) {
			pinoLogger.debug(`Skipping ${match.name}: already auto-managed in this session.`);
			return;
		}

		pinoLogger.info(`🤖 Auto-manage voor ${match.name}...`);
		const result = await runManager({
			settings,
			api,
			getCookies,
			decodeTurboStream,
			extractEditionRouteLoader,
			options: {
				submit: true,
				allowTransfers: process.env.ALLOW_AUTO_TRANSFERS === 'true',
				onLog
			}
		});

		markAutoManaged(match.id);
		await persistDecision({
			matchId: match.id,
			matchName: match.name,
			decisionType: 'lineup',
			summary: result.decision.summary,
			confidence: result.decision.confidence,
			reasoning: formatDecisionReasoning(result.decision),
			submitted: result.submitted
		});

		broadcastSse({
			type: 'manage',
			matchId: match.id,
			matchName: match.name,
			summary: result.decision.summary,
			confidence: result.decision.confidence,
			reasoning: formatDecisionReasoning(result.decision),
			submitted: true,
			autoManaged: true
		});

		invalidateOverviewCache();
		pinoLogger.info(`✅ Auto-manage voltooid voor ${match.name}.`);
	} catch (error) {
		pinoLogger.error(`❌ Auto-manage mislukt: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		setManageRunning(false);
	}
}

export async function runManageJob(options: {
	dryRun?: boolean;
	submit?: boolean;
	allowTransfers?: boolean;
	matchId?: number;
}): Promise<{ accepted: boolean; matchId?: number }> {
	const settings = getSettings();
	const matchId = options.matchId;

	if (matchId && isManageInFlight(matchId)) {
		return { accepted: false, matchId };
	}

	if (matchId) {
		markManageInFlight(matchId);
	}

	const dryRun = Boolean(options.dryRun);
	const submit = options.submit !== false && !dryRun;
	const onLog = createOnLog();

	try {
		const { api, getCookies } = await createAuthenticatedApi(settings, {
			onAuthRefresh: (message) => pinoLogger.info(message)
		});

		const result = await runManager({
			settings,
			api,
			getCookies,
			decodeTurboStream,
			extractEditionRouteLoader,
			options: {
				dryRun,
				submit,
				allowTransfers: Boolean(options.allowTransfers),
				onLog
			}
		});

		const match = result.context.match;
		await persistDecision({
			matchId: match.id,
			matchName: match.name,
			decisionType: 'lineup',
			summary: result.decision.summary,
			confidence: result.decision.confidence,
			reasoning: formatDecisionReasoning(result.decision),
			submitted: result.submitted
		});

		broadcastSse({
			type: 'manage',
			matchId: match.id,
			matchName: match.name,
			summary: result.decision.summary,
			confidence: result.decision.confidence,
			reasoning: formatDecisionReasoning(result.decision),
			submitted: result.submitted,
			autoManaged: false
		});

		invalidateOverviewCache();
		return { accepted: true, matchId: match.id };
	} catch (error) {
		broadcastSse({
			type: 'manage-failed',
			matchId,
			reason: error instanceof Error ? error.message : String(error)
		});
		throw error;
	} finally {
		if (matchId) {
			clearManageInFlight(matchId);
		}
	}
}

export async function runRosterJob(options: {
	dryRun?: boolean;
	submit?: boolean;
	force?: boolean;
}): Promise<void> {
	const settings = getSettings();
	const dryRun = Boolean(options.dryRun);
	const submit = options.submit !== false && !dryRun;
	const onLog = createOnLog();

	const { api, getCookies } = await createAuthenticatedApi(settings, {
		onAuthRefresh: (message) => pinoLogger.info(message)
	});

	const result = await runRosterBuilder({
		settings,
		api,
		getCookies,
		decodeTurboStream,
		extractEditionRouteLoader,
		options: {
			dryRun,
			submit,
			force: Boolean(options.force),
			onLog
		}
	});

	await persistDecision({
		decisionType: 'roster',
		summary: result.decision?.summary ?? 'Roster bijgewerkt',
		reasoning: formatDecisionReasoning(result.decision),
		submitted: result.submitted
	});

	broadcastSse({
		type: 'roster',
		summary: result.decision?.summary ?? 'Roster bijgewerkt',
		reasoning: formatDecisionReasoning(result.decision),
		submitted: result.submitted
	});

	invalidateOverviewCache();
}

export async function runAuthRefreshJob(): Promise<void> {
	pinoLogger.info('🔑 Auth sessie vernieuwen...');
	const settings = getSettings();
	try {
		const cookies = await runAuthRefresh(settings, { onLog: (message) => pinoLogger.info(message) });
		pinoLogger.info(`✅ Auth vernieuwd (${cookies.length} cookies).`);
	} catch (err) {
		pinoLogger.error(formatAuthLoginError(err));
	}
}

export { AUTO_MANAGE_WINDOW_MS };
