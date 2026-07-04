// @ts-nocheck — thin orchestration layer over legacy JS server modules
import { getSettings } from './config.js';
import { createAuthenticatedApi, runAuthRefresh } from './auth.js';
import { formatAuthLoginError } from './auth-errors.js';
import { WielermanagerApiClient } from './wielermanager-api.js';
import { decodeTurboStream, extractEditionRouteLoader } from './turbo-stream.js';
import { runManager, runRosterBuilder, buildManagerContext } from './manager.js';
import { describeLineup } from './lineup.js';
import { getFreeTransfers, validateLineup, lineupToApiPayload, validateRosterIds } from './rules.js';
import { areTransfersOpen, validateTransfer } from './transfers.js';
import { pinoLogger, broadcastSse } from './logger';
import {
	getManageRunning,
	setManageRunning,
	getOverviewCache,
	setOverviewCache,
	invalidateOverviewCache,
	markManageInFlight,
	clearManageInFlight,
	isManageInFlight,
	getRosterRunning,
	setRosterRunning
} from './app-state';
import { wasMatchLineupSubmitted } from './decisions';
import { canAutoRefreshAuth } from './auth.js';
import { buildManagePreview, buildRosterPreview, buildLineupSubmitPayload, buildRosterSubmitPayload } from './preview';
import { notifyWebhook } from './webhook';
import type { PreviewSubmitPayload } from '$lib/types/preview';
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
		ranking
	};

	return {
		...base,
		auth: {
			valid: Boolean(overview.gameStatus?.user),
			canRefresh: canAutoRefreshAuth(settings)
		},
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

		if (await wasMatchLineupSubmitted(match.id)) {
			pinoLogger.debug(`Skipping ${match.name}: lineup already submitted for this match.`);
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
			autoManaged: true,
			preview: buildManagePreview({
				...result,
				allowTransfers: process.env.ALLOW_AUTO_TRANSFERS === 'true',
				submitted: true
			})
		});

		await notifyWebhook({
			event: 'auto-manage-success',
			title: `Auto-manage voltooid: ${match.name}`,
			message: result.decision.summary,
			submitted: true,
			matchId: match.id,
			matchName: match.name,
			autoManaged: true
		});

		invalidateOverviewCache();
		pinoLogger.info(`✅ Auto-manage voltooid voor ${match.name}.`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		pinoLogger.error(`❌ Auto-manage mislukt: ${message}`);
		await notifyWebhook({
			event: 'auto-manage-failed',
			title: 'Auto-manage mislukt',
			message,
			autoManaged: true
		});
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
		const preview = buildManagePreview({
			...result,
			allowTransfers: Boolean(options.allowTransfers),
			submitted: result.submitted
		});

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
			autoManaged: false,
			preview,
			submit: result.submitted ? undefined : buildLineupSubmitPayload(result)
		});

		await notifyWebhook({
			event: result.submitted ? 'manage-success' : 'manage-simulated',
			title: result.submitted ? `Lineup ingediend: ${match.name}` : `Lineup simulatie: ${match.name}`,
			message: result.decision.summary,
			submitted: result.submitted,
			matchId: match.id,
			matchName: match.name
		});

		invalidateOverviewCache();
		return { accepted: true, matchId: match.id };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		broadcastSse({
			type: 'manage-failed',
			matchId,
			reason: message
		});
		await notifyWebhook({
			event: 'manage-failed',
			title: 'Lineup mislukt',
			message,
			matchId,
			matchName: undefined
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
	if (getRosterRunning()) {
		pinoLogger.debug('Skipping overlapping roster run.');
		return;
	}

	setRosterRunning(true);
	const settings = getSettings();
	const dryRun = Boolean(options.dryRun);
	const submit = options.submit !== false && !dryRun;
	const onLog = createOnLog();

	try {
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

		const preview = buildRosterPreview(result);

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
			submitted: result.submitted,
			preview,
			submit: result.submitted ? undefined : buildRosterSubmitPayload(result)
		});

		await notifyWebhook({
			event: result.submitted ? 'roster-success' : 'roster-simulated',
			title: result.submitted ? 'Ploeg ingediend' : 'Ploeg simulatie',
			message: result.decision?.summary ?? 'Roster bijgewerkt',
			submitted: result.submitted
		});

		invalidateOverviewCache();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		broadcastSse({
			type: 'roster-failed',
			reason: message
		});
		await notifyWebhook({
			event: 'roster-failed',
			title: 'Ploeg samenstellen mislukt',
			message
		});
		throw error;
	} finally {
		setRosterRunning(false);
	}
}

export async function submitPreviewJob(
	payload: PreviewSubmitPayload,
	options: { allowTransfers?: boolean } = {}
): Promise<void> {
	const settings = getSettings();
	const onLog = createOnLog();

	const { api, getCookies } = await createAuthenticatedApi(settings, {
		onAuthRefresh: (message) => pinoLogger.info(message)
	});

	if (payload.kind === 'roster') {
		if (!payload.cyclistIds?.length) {
			throw new Error('Geen ploeg om in te dienen.');
		}

		const context = await buildManagerContext(
			api,
			getCookies(),
			decodeTurboStream,
			extractEditionRouteLoader
		);
		const validation = validateRosterIds(payload.cyclistIds, context.allCyclists, context.gameRules);
		if (!validation.valid) {
			throw new Error(`Ongeldige ploeg: ${validation.errors.join('; ')}`);
		}

		onLog('Simulatie indienen — ploeg opslaan bij Sporza...');
		await api.saveRoster(getCookies(), payload.cyclistIds);

		await persistDecision({
			decisionType: 'roster',
			summary: payload.summary ?? 'Roster ingediend vanuit simulatie',
			confidence: payload.confidence,
			submitted: true
		});

		broadcastSse({
			type: 'roster',
			summary: payload.summary ?? 'Roster ingediend vanuit simulatie',
			submitted: true
		});

		await notifyWebhook({
			event: 'roster-success',
			title: 'Ploeg ingediend (simulatie)',
			message: payload.summary ?? 'Roster ingediend vanuit simulatie',
			submitted: true
		});

		invalidateOverviewCache();
		return;
	}

	if (payload.kind !== 'lineup' || !payload.matchId || !payload.lineup?.length) {
		throw new Error('Geen lineup om in te dienen.');
	}

	const context = await buildManagerContext(
		api,
		getCookies(),
		decodeTurboStream,
		extractEditionRouteLoader
	);

	let roster = context.roster ?? [];
	const transferState = await api.fetchTransferState(getCookies());
	const transfersOpen = areTransfersOpen(context.gameStatus, context.overview?.edition);

	if (payload.transfer && transfersOpen) {
		if (!options.allowTransfers) {
			onLog('Transfer uit simulatie overgeslagen — niet ingeschakeld.', 'warn');
		} else {
			const transferResult = validateTransfer(
				payload.transfer,
				roster,
				context.allCyclists,
				context.gameRules,
				transferState.usedTransfers
			);
			if (!transferResult.valid) {
				throw new Error(`Transfer ongeldig: ${transferResult.errors.join('; ')}`);
			}
			onLog('Transfer uit simulatie indienen...');
			await api.createTransfer(getCookies(), payload.transfer.ridersIn, payload.transfer.ridersOut);
			roster = transferResult.nextRoster;
			onLog('Transfer uitgevoerd.');
		}
	}

	const lineupValidation = validateLineup(payload.lineup, roster, context.gameRules);
	if (!lineupValidation.valid) {
		throw new Error(`Ongeldige lineup: ${lineupValidation.errors.join('; ')}`);
	}

	onLog(`Simulatie indienen — lineup opslaan voor ${payload.matchName ?? payload.matchId}...`);
	await api.saveLineup(getCookies(), payload.matchId, lineupToApiPayload(payload.lineup));

	await persistDecision({
		matchId: payload.matchId,
		matchName: payload.matchName ?? null,
		decisionType: 'lineup',
		summary: payload.summary ?? 'Lineup ingediend vanuit simulatie',
		confidence: payload.confidence,
		submitted: true
	});

	broadcastSse({
		type: 'manage',
		matchId: payload.matchId,
		matchName: payload.matchName ?? `Rit ${payload.matchId}`,
		summary: payload.summary ?? 'Lineup ingediend vanuit simulatie',
		confidence: payload.confidence,
		submitted: true
	});

	await notifyWebhook({
		event: 'manage-success',
		title: `Lineup ingediend (simulatie): ${payload.matchName ?? payload.matchId}`,
		message: payload.summary ?? 'Lineup ingediend vanuit simulatie',
		submitted: true,
		matchId: payload.matchId,
		matchName: payload.matchName
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
