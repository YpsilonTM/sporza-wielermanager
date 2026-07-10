import { formatRiderName, formatRoleLabel } from '$lib/format';
import { broadcastSse } from './logger';
import { invalidateOverviewCache } from './app-state';
import { notifyWebhook } from './webhook';
import { normalizeConfidence } from './confidence';
import { prisma } from './db';
import type { SseEvent } from '$lib/types/sse';

type DecisionReasoningEntry = {
	cyclistId?: number;
	lineupType?: string;
	reasoning?: string;
};

type DecisionWithReasoning = {
	lineup?: DecisionReasoningEntry[];
	picks?: DecisionReasoningEntry[];
	transfers?: Array<{ reasoning?: string }>;
} | null | undefined;

export function formatDecisionReasoning(
	decision: DecisionWithReasoning,
	cyclists?: Array<{ id: number; firstName?: string; lastName?: string }>
): string {
	if (!decision) return '';

	const byId = new Map((cyclists ?? []).map((cyclist) => [cyclist.id, cyclist]));
	const lines: string[] = [];

	for (const entry of decision.lineup ?? []) {
		if (!entry.reasoning?.trim()) continue;
		const name = formatRiderName(byId.get(entry.cyclistId ?? 0));
		const role = entry.lineupType ? formatRoleLabel(entry.lineupType) : '';
		lines.push(`• ${name}${role ? ` (${role})` : ''}: ${entry.reasoning.trim()}`);
	}

	for (const pick of Array.isArray(decision.picks) ? decision.picks : []) {
		if (!pick.reasoning?.trim()) continue;
		const name = formatRiderName(byId.get(pick.cyclistId ?? 0));
		lines.push(`• ${name}: ${pick.reasoning.trim()}`);
	}

	for (const transfer of decision.transfers ?? []) {
		if (!transfer.reasoning?.trim()) continue;
		lines.push(`• Transfer: ${transfer.reasoning.trim()}`);
	}

	return lines.join('\n');
}

export async function persistDecision(entry: {
	matchId?: number;
	matchName?: string | null;
	decisionType: string;
	summary: string;
	confidence?: number | string;
	reasoning?: string;
	previewJson?: string;
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
			previewJson: entry.previewJson || '',
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
