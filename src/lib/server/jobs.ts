// @ts-nocheck — orchestration over legacy JS manager/predictor modules
import { getSettings } from './config.js';
import { runAuthRefresh } from './auth.js';
import { formatAuthLoginError } from './auth-errors.js';
import { runManager, runRosterBuilder } from './manager.js';
import { submitLineupWithOptionalTransfer, submitRosterFromPreview } from './manager.js';
import { buildManagePreview, buildRosterPreview, buildLineupSubmitPayload, buildRosterSubmitPayload } from './preview';
import { pinoLogger } from './logger';
import { broadcastSse } from './logger';
import {
	getManageRunning,
	setManageRunning,
	invalidateOverviewCache,
	markManageInFlight,
	clearManageInFlight,
	isManageInFlight,
	getRosterRunning,
	setRosterRunning
} from './app-state';
import { wasMatchLineupSubmitted } from './decisions';
import { notifyWebhook } from './webhook';
import { createManagerApiContext, getUpcomingMatch } from './format';
import { fetchOverviewRaw } from './overview-service';
import { emitJobResult, formatDecisionReasoning } from './job-side-effects';
import { enrichStageForUi } from './overview-enrichment';
import type { PreviewSubmitPayload } from '$lib/types/preview';

export { fetchOverviewData } from './overview-service';
export { persistDecision } from './job-side-effects';

export async function runAutoManage(): Promise<void> {
	if (getManageRunning()) {
		pinoLogger.debug('Skipping overlapping auto-manage run.');
		return;
	}

	setManageRunning(true);
	const settings = getSettings();

	try {
		const ctx = await createManagerApiContext(settings);
		let overview = await fetchOverviewRaw(settings, ctx.api, ctx.getCookies());
		const match = getUpcomingMatch(overview);

		if (!match) {
			pinoLogger.debug('No upcoming match — skipping auto-manage.');
			return;
		}

		if (!overview.gameStatus?.roster?.length) {
			pinoLogger.info('Geen ploeg gevonden — AI bouwt initiële roster...');
			await runRosterBuilder({
				settings,
				api: ctx.api,
				getCookies: ctx.getCookies,
				decodeTurboStream: ctx.decodeTurboStream,
				extractEditionRouteLoader: ctx.extractEditionRouteLoader,
				options: {
					submit: true,
					onLog: ctx.onLog
				}
			});
			invalidateOverviewCache();
			overview = await fetchOverviewRaw(settings, ctx.api, ctx.getCookies());
		}

		if (!overview.gameStatus?.roster?.length) {
			pinoLogger.debug('Roster still empty after build attempt — skipping auto-manage.');
			await notifyWebhook({
				event: 'auto-manage-skip',
				title: 'Auto-manage overgeslagen',
				message: 'Ploeg nog leeg na build-poging.',
				autoManaged: true,
				matchId: match.id,
				matchName: match.name,
				reason: 'empty-roster'
			});
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
			api: ctx.api,
			getCookies: ctx.getCookies,
			decodeTurboStream: ctx.decodeTurboStream,
			extractEditionRouteLoader: ctx.extractEditionRouteLoader,
			options: {
				submit: true,
				allowTransfers: process.env.ALLOW_AUTO_TRANSFERS === 'true',
				onLog: ctx.onLog
			}
		});

		const reasoning = formatDecisionReasoning(result.decision, result.context.allCyclists);
		const preview = buildManagePreview({
			...result,
			allowTransfers: process.env.ALLOW_AUTO_TRANSFERS === 'true',
			submitted: true
		});
		const source = result.decisionSource ?? result.decision?.source ?? 'ai';

		await emitJobResult({
			persist: {
				matchId: match.id,
				matchName: match.name,
				decisionType: 'lineup',
				summary: result.decision.summary,
				confidence: result.decision.confidence,
				reasoning,
				previewJson: JSON.stringify(preview),
				decisionSource: source,
				submitted: true
			},
			sse: {
				type: 'manage',
				matchId: match.id,
				matchName: match.name,
				summary: result.decision.summary,
				confidence: result.decision.confidence,
				reasoning,
				submitted: true,
				autoManaged: true,
				preview,
			},
			webhook: {
				event: 'auto-manage-success',
				title: `Auto-manage voltooid: ${match.name}`,
				message: result.decision.summary,
				submitted: true,
				matchId: match.id,
				matchName: match.name,
				autoManaged: true,
				confidence: result.decision.confidence,
				source
			}
		});

		pinoLogger.info(`✅ Auto-manage voltooid voor ${match.name}.`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		pinoLogger.error(`❌ Auto-manage mislukt: ${message}`);
		await notifyWebhook({
			event: 'auto-manage-failed',
			title: 'Auto-manage mislukt',
			message,
			autoManaged: true,
			reason: message
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

	try {
		const ctx = await createManagerApiContext(settings);

		const result = await runManager({
			settings,
			api: ctx.api,
			getCookies: ctx.getCookies,
			decodeTurboStream: ctx.decodeTurboStream,
			extractEditionRouteLoader: ctx.extractEditionRouteLoader,
			options: {
				dryRun,
				submit,
				allowTransfers: Boolean(options.allowTransfers),
				onLog: ctx.onLog
			}
		});

		const match = result.context.match;
		const preview = buildManagePreview({
			...result,
			allowTransfers: Boolean(options.allowTransfers),
			submitted: result.submitted
		});
		const reasoning = formatDecisionReasoning(result.decision, result.context.allCyclists);
		const source = result.decisionSource ?? result.decision?.source ?? 'ai';

		await emitJobResult({
			persist: {
				matchId: match.id,
				matchName: match.name,
				decisionType: 'lineup',
				summary: result.decision.summary,
				confidence: result.decision.confidence,
				reasoning,
				previewJson: JSON.stringify(preview),
				decisionSource: source,
				submitted: result.submitted
			},
			sse: {
				type: 'manage',
				matchId: match.id,
				matchName: match.name,
				summary: result.decision.summary,
				confidence: result.decision.confidence,
				reasoning,
				submitted: result.submitted,
				autoManaged: false,
				preview,
				submit: result.submitted ? undefined : buildLineupSubmitPayload(result)
			},
			webhook: {
				event: result.submitted ? 'manage-success' : 'manage-simulated',
				title: result.submitted ? `Lineup ingediend: ${match.name}` : `Lineup simulatie: ${match.name}`,
				message: result.decision.summary,
				submitted: result.submitted,
				matchId: match.id,
				matchName: match.name,
				confidence: result.decision.confidence,
				source
			}
		});

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

	try {
		const ctx = await createManagerApiContext(settings);

		const result = await runRosterBuilder({
			settings,
			api: ctx.api,
			getCookies: ctx.getCookies,
			decodeTurboStream: ctx.decodeTurboStream,
			extractEditionRouteLoader: ctx.extractEditionRouteLoader,
			options: {
				dryRun,
				submit,
				force: Boolean(options.force),
				onLog: ctx.onLog
			}
		});

		const preview = buildRosterPreview(result);
		const reasoning = formatDecisionReasoning(result.decision, result.context.allCyclists);

		await emitJobResult({
			persist: {
				decisionType: 'roster',
				summary: result.decision?.summary ?? 'Roster bijgewerkt',
				reasoning,
				previewJson: JSON.stringify(preview),
				submitted: result.submitted
			},
			sse: {
				type: 'roster',
				summary: result.decision?.summary ?? 'Roster bijgewerkt',
				reasoning,
				submitted: result.submitted,
				preview,
				submit: result.submitted ? undefined : buildRosterSubmitPayload(result)
			},
			webhook: {
				event: result.submitted ? 'roster-success' : 'roster-simulated',
				title: result.submitted ? 'Ploeg ingediend' : 'Ploeg simulatie',
				message: result.decision?.summary ?? 'Roster bijgewerkt',
				submitted: result.submitted
			}
		});
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
	const ctx = await createManagerApiContext(settings);

	if (payload.kind === 'roster') {
		if (!payload.cyclistIds?.length) {
			throw new Error('Geen ploeg om in te dienen.');
		}

		await submitRosterFromPreview({
			api: ctx.api,
			getCookies: ctx.getCookies,
			decodeTurboStream: ctx.decodeTurboStream,
			extractEditionRouteLoader: ctx.extractEditionRouteLoader,
			cyclistIds: payload.cyclistIds,
			onLog: ctx.onLog
		});

		await emitJobResult({
			persist: {
				decisionType: 'roster',
				summary: payload.summary ?? 'Roster ingediend vanuit simulatie',
				confidence: payload.confidence,
				submitted: true
			},
			sse: {
				type: 'roster',
				summary: payload.summary ?? 'Roster ingediend vanuit simulatie',
				submitted: true
			},
			webhook: {
				event: 'roster-success',
				title: 'Ploeg ingediend (simulatie)',
				message: payload.summary ?? 'Roster ingediend vanuit simulatie',
				submitted: true
			}
		});
		return;
	}

	if (payload.kind !== 'lineup' || !payload.matchId || !payload.lineup?.length) {
		throw new Error('Geen lineup om in te dienen.');
	}

	await submitLineupWithOptionalTransfer({
		api: ctx.api,
		getCookies: ctx.getCookies,
		decodeTurboStream: ctx.decodeTurboStream,
		extractEditionRouteLoader: ctx.extractEditionRouteLoader,
		payload,
		allowTransfers: Boolean(options.allowTransfers),
		onLog: ctx.onLog
	});

	await emitJobResult({
		persist: {
			matchId: payload.matchId,
			matchName: payload.matchName ?? null,
			decisionType: 'lineup',
			summary: payload.summary ?? 'Lineup ingediend vanuit simulatie',
			confidence: payload.confidence,
			submitted: true
		},
		sse: {
			type: 'manage',
			matchId: payload.matchId,
			matchName: payload.matchName ?? `Rit ${payload.matchId}`,
			summary: payload.summary ?? 'Lineup ingediend vanuit simulatie',
			confidence: payload.confidence,
			submitted: true
		},
		webhook: {
			event: 'manage-success',
			title: `Lineup ingediend (simulatie): ${payload.matchName ?? payload.matchId}`,
			message: payload.summary ?? 'Lineup ingediend vanuit simulatie',
			submitted: true,
			matchId: payload.matchId,
			matchName: payload.matchName
		}
	});
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
