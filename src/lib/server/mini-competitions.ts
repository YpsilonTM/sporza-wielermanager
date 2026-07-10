import type { MiniCompetitionStandingView, MiniCompetitionView } from '$lib/types/overview';

type RawMiniCompetitionRanking = {
	rank?: number;
	points?: number;
	teamName?: string;
	userName?: string;
	isMyTeam?: boolean;
};

type RawMiniCompetition = {
	slug?: string;
	name?: string;
	owner?: boolean;
	memberCount?: number;
	topRankings?: RawMiniCompetitionRanking[];
};

export function mapMiniCompetitions(raw: unknown): MiniCompetitionView[] {
	if (!Array.isArray(raw)) {
		return [];
	}

	return raw
		.map((entry) => mapMiniCompetition(entry as RawMiniCompetition))
		.filter((entry): entry is MiniCompetitionView => entry != null);
}

function mapMiniCompetition(entry: RawMiniCompetition): MiniCompetitionView | null {
	if (!entry.slug || !entry.name) {
		return null;
	}

	const topRankings = Array.isArray(entry.topRankings) ? entry.topRankings : [];
	const standings = topRankings
		.map(mapStanding)
		.filter((standing): standing is MiniCompetitionStandingView => standing != null)
		.sort((a, b) => a.rank - b.rank);

	const myStanding = standings.find((standing) => standing.isMyTeam) ?? null;

	return {
		slug: entry.slug,
		name: entry.name,
		owner: Boolean(entry.owner),
		memberCount: Number(entry.memberCount) || standings.length || null,
		myRank: myStanding?.rank ?? null,
		myPoints: myStanding?.points ?? null,
		standings
	};
}

function mapStanding(entry: RawMiniCompetitionRanking): MiniCompetitionStandingView | null {
	const rank = Number(entry.rank);
	if (!Number.isFinite(rank)) {
		return null;
	}

	return {
		rank,
		points: Number(entry.points) || 0,
		teamName: entry.teamName?.trim() || '—',
		userName: entry.userName?.trim() || undefined,
		isMyTeam: Boolean(entry.isMyTeam)
	};
}
