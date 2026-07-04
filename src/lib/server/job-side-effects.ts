import { broadcastSse } from './logger';
import { invalidateOverviewCache } from './app-state';
import { notifyWebhook } from './webhook';
import { normalizeConfidence } from './confidence';
import { prisma } from './db';
import type { SseEvent } from '$lib/types/sse';

export function formatDecisionReasoning(decision: {
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

export async function persistDecision(entry: {
	matchId?: number;
	matchName?: string | null;
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

type WebhookPayload = Parameters<typeof notifyWebhook>[0];

export async function emitJobResult(options: {
	persist?: Parameters<typeof persistDecision>[0];
	sse: SseEvent;
	webhook: WebhookPayload;
	invalidateCache?: boolean;
}): Promise<void> {
	if (options.persist) {
		await persistDecision(options.persist);
	}

	broadcastSse(options.sse);
	await notifyWebhook(options.webhook);

	if (options.invalidateCache !== false) {
		invalidateOverviewCache();
	}
}
