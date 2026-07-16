import { prisma } from './db';
import type { ManagePreviewView, RosterPreviewView } from '$lib/types/preview';
import type { ManagerDecisionView } from '$lib/types/decisions';
import { mapPostMortem } from './post-mortem';

/** True when a submitted lineup decision exists for this match (survives restarts). */
export async function wasMatchLineupSubmitted(matchId: number): Promise<boolean> {
	const count = await prisma.managerDecision.count({
		where: {
			matchId,
			decisionType: 'lineup',
			submitted: true
		}
	});
	return count > 0;
}

function parseDecisionPreview(
	decisionType: string,
	previewJson: string
): ManagePreviewView | RosterPreviewView | null {
	if (!previewJson) return null;

	try {
		const parsed = JSON.parse(previewJson) as ManagePreviewView | RosterPreviewView;
		if (decisionType === 'lineup' && parsed && 'proposedLineup' in parsed) {
			return parsed;
		}
		if (decisionType === 'roster' && parsed && ('added' in parsed || 'removed' in parsed)) {
			return parsed;
		}
	} catch {
		return null;
	}

	return null;
}

export function mapDecisionToView(decision: {
	id: number;
	matchId: number | null;
	matchName: string | null;
	decisionType: string;
	summary: string;
	confidence: number | null;
	reasoning: string;
	previewJson: string;
	matchScore?: number | null;
	postMortemJson?: string | null;
	decisionSource?: string | null;
	submitted: boolean;
	submittedAt: Date;
}): ManagerDecisionView {
	return {
		id: decision.id,
		matchId: decision.matchId,
		matchName: decision.matchName,
		decisionType: decision.decisionType,
		summary: decision.summary,
		confidence: decision.confidence,
		reasoning: decision.reasoning,
		preview: parseDecisionPreview(decision.decisionType, decision.previewJson),
		matchScore: decision.matchScore ?? null,
		postMortem: mapPostMortem(decision.postMortemJson),
		decisionSource: decision.decisionSource ?? null,
		submitted: decision.submitted,
		submittedAt: decision.submittedAt.toISOString()
	};
}

export async function fetchRecentDecisions(limit = 10) {
	return prisma.managerDecision.findMany({
		orderBy: { submittedAt: 'desc' },
		take: limit
	});
}
