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
		primaryAction = 'roster_submit';
		primaryLabel = 'AI ploeg samenstellen';
		primaryDescription = `Je ploeg telt ${rosterCount}/${squadSize} renners. Stel eerst een volledige ploeg samen.`;
		showRosterActions = true;
	} else if (preRaceSquadWindow) {
		phase = 'pre_race';
		showRosterActions = false;
		if (lineupSubmitted) {
			primaryAction = 'manage_submit';
			primaryLabel = 'Ploeg & lineup opnieuw instellen';
			primaryDescription =
				'Vóór rit 1 kun je gratis wisselen. AI controleert gezondheid, past je ploeg aan en werkt je lineup bij.';
		} else {
			primaryAction = 'manage_submit';
			primaryLabel = 'Ploeg checken & lineup instellen';
			primaryDescription =
				'Vóór rit 1 kun je gratis wisselen. AI controleert blessures, past je ploeg aan en dient je lineup in.';
		}
	} else if (match && !lineupSubmitted) {
		phase = 'needs_lineup';
		showRosterActions = false;
		primaryAction = 'manage_submit';
		primaryLabel = 'Lineup instellen met AI';
		primaryDescription = `Kies starters, kapitein en bank voor ${match.name}.`;
	} else if (match && lineupSubmitted) {
		phase = 'lineup_ready';
		showRosterActions = false;
		primaryAction = 'manage_submit';
		primaryLabel = 'Lineup bijwerken met AI';
		primaryDescription = 'Er staat al een lineup ingediend. AI kan een nieuw voorstel maken en indienen.';
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
		secondaryLabel: 'Simuleer AI-keuze (niet indienen)',
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
