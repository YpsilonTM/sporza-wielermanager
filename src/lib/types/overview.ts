export interface EnrichedStage {
	id: number;
	name: string;
	matchType?: string;
	terrainType?: string;
	deadline?: string;
	startTime?: string;
	stageProfileUrl?: string;
	minutesUntilDeadline: number;
	autoManageScheduled: boolean;
	autoManageAt?: string;
	rosterSize: number;
}

export interface LineupRiderView {
	id: number;
	name: string;
	role?: string;
	team?: string;
	teamShortName?: string;
	jerseyUrl?: string;
	price?: number;
}

export interface RosterRiderView {
	id: number;
	name: string;
	team?: string;
	teamShortName?: string;
	jerseyUrl?: string;
	price?: number;
}

export interface LineupView {
	starters: LineupRiderView[];
	bench: LineupRiderView[];
	submitted: boolean;
}

export interface TransferStateView {
	usedTransfers: number;
	freeTransfers: number;
	freeTransfersRemaining: number;
	remainingBudget: number;
	transfersOpen: boolean;
}

export interface AuthStatusView {
	valid: boolean;
	canRefresh: boolean;
}

export interface RankingView {
	rank: number | null;
	amountOfPlayers: number | null;
	overallScore: number | null;
	lastMatchScore: number | null;
	lastMatchName: string | null;
}

export type OverviewPhase =
	| 'build_squad'
	| 'pre_race'
	| 'needs_lineup'
	| 'lineup_ready'
	| 'idle';

export type PrimaryAction = 'roster_submit' | 'roster_simulate' | 'manage_submit' | 'manage_simulate' | null;

export interface OverviewUiState {
	phase: OverviewPhase;
	primaryAction: PrimaryAction;
	primaryLabel: string;
	primaryDescription: string;
	secondaryLabel: string;
	showRosterActions: boolean;
	squadSize: number;
	rosterCount: number;
	rosterComplete: boolean;
	preRaceSquadWindow: boolean;
	transfersOpen: boolean;
	lineupSubmitted: boolean;
	transferWindowLabel: string;
	minutesUntilDeadline: number | null;
	autoManageScheduled: boolean;
}

export interface OverviewData {
	edition: { name?: string; slug?: string } | null;
	gameStatus: {
		user?: { name?: string };
		gameTeam?: { name?: string; teamType?: string };
		roster?: unknown[];
	} | null;
	gameRules: Record<string, unknown> | null;
	upcomingMatch: EnrichedStage | null;
	upcomingLineup: LineupView | null;
	rosterPreview: RosterRiderView[];
	transferState: TransferStateView | null;
	ranking: RankingView | null;
	auth: AuthStatusView;
	ui: OverviewUiState;
}
