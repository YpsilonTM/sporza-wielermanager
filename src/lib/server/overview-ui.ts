import { getSquadSize, rosterIsComplete } from './rules.js';
import {
	areTransfersOpen,
	describeTransferWindow,
	isPreRaceSquadWindow,
	minutesUntilMatch
} from './transfers.js';
import type { OverviewData, LineupRiderView, OverviewUiState, RosterRiderView } from '$lib/types/overview';

function riderLabel(cyclist: {
	id: number;
	firstName?: string;
	lastName?: string;
	lineupType?: string;
	price?: number;
	team?: { name?: string; shortName?: string; jerseyUrl?: string };
}): LineupRiderView {
	return {
		id: cyclist.id,
		name: `${cyclist.firstName ?? ''} ${cyclist.lastName ?? ''}`.trim() || `#${cyclist.id}`,
		role: cyclist.lineupType,
		team: cyclist.team?.name,
		teamShortName: cyclist.team?.shortName,
		jerseyUrl: cyclist.team?.jerseyUrl,
		price: cyclist.price
	};
}

export function mapRosterView(roster: unknown[]): RosterRiderView[] {
	return (roster ?? []).map((entry) => {
		const cyclist = entry as Parameters<typeof riderLabel>[0];
		const mapped = riderLabel(cyclist);
		return {
			id: mapped.id,
			name: mapped.name,
			team: mapped.team,
			teamShortName: mapped.teamShortName,
			jerseyUrl: mapped.jerseyUrl,
			price: mapped.price
		};
	});
}

export function mapLineupView(raw: {
	starters?: Array<Record<string, unknown>>;
	bench?: Array<Record<string, unknown>>;
}) {
	const starters = (raw.starters ?? []).map((r) =>
		riderLabel(r as Parameters<typeof riderLabel>[0])
	);
	const bench = (raw.bench ?? []).map((r) => riderLabel(r as Parameters<typeof riderLabel>[0]));
	return { starters, bench, submitted: starters.length + bench.length > 0 };
}

export function buildOverviewUi(data: Omit<OverviewData, 'ui'>): OverviewUiState {
	const squadSize = getSquadSize(data.gameRules ?? {});
	const roster = data.gameStatus?.roster ?? [];
	const rosterCount = roster.length;
	const rosterComplete = rosterIsComplete(roster, data.gameRules ?? {});
	const preRaceSquadWindow = isPreRaceSquadWindow(
		data.gameStatus ?? {},
		data.edition ?? undefined
	);
	const transfersOpen = areTransfersOpen(data.gameStatus ?? {}, data.edition ?? undefined);
	const lineupSubmitted = Boolean(
		data.upcomingLineup && (data.upcomingLineup.starters.length > 0 || data.upcomingLineup.bench.length > 0)
	);
	const match = data.upcomingMatch;
	const minutesUntilDeadline = match ? minutesUntilMatch(match) : null;

	let phase: OverviewUiState['phase'];
	let primaryAction: OverviewUiState['primaryAction'];
	let primaryLabel: string;
	let primaryDescription: string;
	let showRosterActions: boolean;

	if (!rosterComplete) {
		phase = 'build_squad';
		primaryAction = 'roster_simulate';
		primaryLabel = 'AI ploegvoorstel maken';
		primaryDescription = `Je ploeg telt ${rosterCount}/${squadSize} renners. AI stelt een voorstel samen — bekijk de diff en dien daarna in.`;
		showRosterActions = true;
	} else if (preRaceSquadWindow) {
		phase = 'pre_race';
		showRosterActions = false;
		primaryAction = 'manage_simulate';
		primaryLabel = lineupSubmitted ? 'Nieuw AI-voorstel maken' : 'AI-voorstel maken';
		primaryDescription =
			'Vóór rit 1 kun je gratis wisselen. AI checkt gezondheid en stelt ploeg + lineup voor — jij keurt goed via de diff.';
	} else if (match && !lineupSubmitted) {
		phase = 'needs_lineup';
		showRosterActions = false;
		primaryAction = 'manage_simulate';
		primaryLabel = 'AI lineup-voorstel maken';
		primaryDescription = `AI stelt starters, kapitein en bank voor voor ${match.name}. Bekijk de diff en dien in wanneer je klaar bent.`;
	} else if (match && lineupSubmitted) {
		phase = 'lineup_ready';
		showRosterActions = false;
		primaryAction = 'manage_simulate';
		primaryLabel = 'Nieuw AI-voorstel maken';
		primaryDescription =
			'Er staat al een lineup ingediend. AI maakt een nieuw voorstel — bekijk de wijzigingen voor je indient.';
	} else {
		phase = 'idle';
		showRosterActions = false;
		primaryAction = null;
		primaryLabel = '';
		primaryDescription = 'Geen aankomende rit gevonden.';
	}

	return {
		phase,
		primaryAction,
		primaryLabel,
		primaryDescription,
		secondaryLabel: 'Direct indienen (overslaat preview)',
		showRosterActions,
		squadSize,
		rosterCount,
		rosterComplete,
		preRaceSquadWindow,
		transfersOpen,
		lineupSubmitted,
		transferWindowLabel: describeTransferWindow(data.gameStatus ?? {}, data.edition ?? undefined),
		minutesUntilDeadline,
		autoManageScheduled: match?.autoManageScheduled ?? false
	};
}
