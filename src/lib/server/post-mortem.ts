import { prisma } from './db';
import { formatRiderName } from '$lib/format';
import type { PostMortemView } from '$lib/types/decisions';

type PreviewLike = {
	proposedLineup?: {
		starters?: Array<{ id?: number; name?: string; role?: string }>;
	};
	currentLineup?: {
		starters?: Array<{ id?: number; name?: string; role?: string }>;
	};
};

function parsePreview(previewJson: string): PreviewLike | null {
	if (!previewJson) return null;
	try {
		return JSON.parse(previewJson) as PreviewLike;
	} catch {
		return null;
	}
}

function captainFromPreview(preview: PreviewLike | null): { id?: number; name?: string } | null {
	const starters =
		preview?.proposedLineup?.starters ?? preview?.currentLineup?.starters ?? [];
	const captain = starters.find((rider) => rider.role === 'CAPTAIN');
	if (!captain) return null;
	return { id: captain.id, name: captain.name };
}

export function buildPostMortemSummary(input: {
	matchName: string | null;
	matchScore: number;
	confidence: number | null;
	summary: string;
	captainName?: string | null;
	recentAverage?: number | null;
	source?: string | null;
}): string {
	const parts: string[] = [];
	parts.push(
		`${input.matchName ?? 'Vorige rit'}: ${input.matchScore} pt` +
			(input.recentAverage != null ? ` (recent gem. ${Math.round(input.recentAverage)})` : '')
	);
	if (input.captainName) {
		parts.push(`Kapitein was ${input.captainName}`);
	}
	if (input.confidence != null) {
		parts.push(`confidence ${input.confidence}`);
	}
	if (input.source) {
		parts.push(`bron ${input.source}`);
	}
	if (input.summary) {
		parts.push(input.summary.slice(0, 180));
	}
	if (input.recentAverage != null && input.matchScore < input.recentAverage * 0.75) {
		parts.push('Score onder recent gemiddelde — herbekijk kapitein/starters.');
	}
	return parts.join(' · ');
}

export function mapPostMortem(raw: string | null | undefined): PostMortemView | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as PostMortemView;
	} catch {
		return null;
	}
}

/** Attach match score + post-mortem to submitted lineup decisions when lastMatch is known. */
export async function ensurePostMortemsForLastMatch(input: {
	matchId: number;
	matchName?: string | null;
	matchScore: number;
	matchScores?: Record<string, number> | null;
}): Promise<PostMortemView | null> {
	const decision = await prisma.managerDecision.findFirst({
		where: {
			matchId: input.matchId,
			decisionType: 'lineup',
			submitted: true
		},
		orderBy: { submittedAt: 'desc' }
	});

	if (!decision) return null;

	if (decision.postMortemJson && decision.matchScore != null) {
		return mapPostMortem(decision.postMortemJson);
	}

	const scores = Object.values(input.matchScores ?? {}).filter((n) => Number.isFinite(n));
	const otherScores = scores.filter((score) => score !== input.matchScore);
	const recentAverage =
		otherScores.length > 0
			? otherScores.reduce((sum, score) => sum + score, 0) / otherScores.length
			: null;

	const preview = parsePreview(decision.previewJson);
	const captain = captainFromPreview(preview);
	let source: string | null = null;
	try {
		const parsed = preview as PreviewLike & { source?: string };
		source = typeof parsed?.source === 'string' ? parsed.source : null;
	} catch {
		source = null;
	}

	const postMortem: PostMortemView = {
		matchId: input.matchId,
		matchName: input.matchName ?? decision.matchName,
		matchScore: input.matchScore,
		recentAverage: recentAverage != null ? Math.round(recentAverage * 10) / 10 : null,
		captainName: captain?.name ?? null,
		captainId: captain?.id ?? null,
		confidence: decision.confidence,
		source,
		summary: buildPostMortemSummary({
			matchName: input.matchName ?? decision.matchName,
			matchScore: input.matchScore,
			confidence: decision.confidence,
			summary: decision.summary,
			captainName: captain?.name,
			recentAverage,
			source
		}),
		updatedAt: new Date().toISOString()
	};

	await prisma.managerDecision.update({
		where: { id: decision.id },
		data: {
			matchScore: input.matchScore,
			postMortemJson: JSON.stringify(postMortem)
		}
	});

	return postMortem;
}

export async function fetchRecentPostMortems(limit = 3): Promise<PostMortemView[]> {
	const rows = await prisma.managerDecision.findMany({
		where: {
			decisionType: 'lineup',
			submitted: true,
			NOT: { postMortemJson: '' }
		},
		orderBy: { submittedAt: 'desc' },
		take: limit
	});

	return rows
		.map((row) => mapPostMortem(row.postMortemJson))
		.filter((entry): entry is PostMortemView => Boolean(entry));
}

export function formatPostMortemsForPrompt(
	postMortems: PostMortemView[],
	roster?: Array<{ id: number; firstName?: string; lastName?: string }>
): string {
	if (!postMortems.length) return '';

	const byId = new Map((roster ?? []).map((cyclist) => [cyclist.id, cyclist]));
	const lines = postMortems.map((pm) => {
		const captain =
			pm.captainName ||
			(pm.captainId != null ? formatRiderName(byId.get(pm.captainId)) : null);
		return `- ${pm.matchName ?? `Rit ${pm.matchId}`}: ${pm.matchScore} pt` +
			(captain ? `, kapitein ${captain}` : '') +
			(pm.recentAverage != null ? `, gem. ${pm.recentAverage}` : '') +
			(pm.summary ? ` — ${pm.summary}` : '');
	});

	return `
RECENTE RITRESULTATEN (leer hiervan — herhaal zwakke kapiteins/starters niet zonder reden):
${lines.join('\n')}
`.trim();
}
