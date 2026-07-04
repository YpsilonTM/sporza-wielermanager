import { describeLineup } from './lineup.js';
import { mapLineupView } from './overview-ui';
import type {
	LineupChangeView,
	ManagePreviewView,
	PreviewSubmitPayload,
	RosterPreviewView,
	TransferPreviewView
} from '$lib/types/preview';
import type { LineupRiderView, LineupView } from '$lib/types/overview';

function riderName(cyclist: { firstName?: string; lastName?: string; id?: number } | undefined): string {
	if (!cyclist) return 'Onbekende renner';
	return `${cyclist.firstName ?? ''} ${cyclist.lastName ?? ''}`.trim() || `#${cyclist.id}`;
}

function roleLabel(role?: string): string {
	if (role === 'CAPTAIN') return 'Kapitein';
	if (role === 'SUBSTITUTE') return 'Bank';
	if (role === 'NORMAL') return 'Starter';
	return '—';
}

function lineupFromDecision(
	lineup: Array<{ cyclistId: number; lineupType: string }>,
	roster: Array<Record<string, unknown>>
): LineupView {
	const rosterById = new Map(roster.map((cyclist) => [cyclist.id as number, cyclist]));
	const riders = (lineup || [])
		.map((entry) => {
			const cyclist = rosterById.get(entry.cyclistId);
			if (!cyclist) return null;
			return { ...cyclist, lineupType: entry.lineupType };
		})
		.filter(Boolean);

	return mapLineupView(describeLineup({ riders }));
}

function lineupFromApiLineup(raw: { riders?: Array<Record<string, unknown>> } | null): LineupView | null {
	if (!raw?.riders?.length) return null;
	return mapLineupView(describeLineup(raw));
}

export function computeLineupChanges(
	current: LineupView | null,
	proposed: LineupView
): LineupChangeView[] {
	const currentRoles = new Map<number, string>();
	for (const rider of [...(current?.starters ?? []), ...(current?.bench ?? [])]) {
		currentRoles.set(rider.id, rider.role ?? 'NORMAL');
	}

	const proposedRoles = new Map<number, LineupRiderView>();
	for (const rider of [...proposed.starters, ...proposed.bench]) {
		proposedRoles.set(rider.id, rider);
	}

	const allIds = new Set([...currentRoles.keys(), ...proposedRoles.keys()]);
	const changes: LineupChangeView[] = [];

	for (const id of allIds) {
		const fromRole = currentRoles.get(id);
		const proposedRider = proposedRoles.get(id);
		const toRole = proposedRider?.role ?? undefined;

		if (fromRole === toRole) continue;

		const name = proposedRider?.name ?? `#${id}`;
		let change: LineupChangeView['change'] = 'role';

		if (!fromRole && toRole) change = 'added';
		else if (fromRole && !toRole) change = 'removed';
		else if (fromRole === 'SUBSTITUTE' && toRole && toRole !== 'SUBSTITUTE') change = 'starter';
		else if (fromRole && fromRole !== 'SUBSTITUTE' && toRole === 'SUBSTITUTE') change = 'bench';

		changes.push({
			id,
			name,
			from: fromRole ? roleLabel(fromRole) : undefined,
			to: toRole ? roleLabel(toRole) : undefined,
			change
		});
	}

	return changes.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

export function buildTransferPreview(
	transfer: { ridersIn?: number[]; ridersOut?: number[]; reasoning?: string } | undefined,
	transferResult: {
		valid?: boolean;
		transferCost?: number;
	} | null,
	allCyclists: Array<{ id: number; firstName?: string; lastName?: string }>,
	executed: boolean
): TransferPreviewView | null {
	if (!transfer?.ridersIn?.length || !transfer?.ridersOut?.length || !transferResult?.valid) {
		return null;
	}

	const byId = new Map(allCyclists.map((cyclist) => [cyclist.id, cyclist]));

	return {
		ridersOut: transfer.ridersOut.map((id) => ({ id, name: riderName(byId.get(id)) })),
		ridersIn: transfer.ridersIn.map((id) => ({ id, name: riderName(byId.get(id)) })),
		cost: transferResult.transferCost ?? 0,
		reasoning: transfer.reasoning,
		executed
	};
}

export function buildManagePreview(result: {
	decision: { lineup?: Array<{ cyclistId: number; lineupType: string }>; transfers?: Array<{ ridersIn?: number[]; ridersOut?: number[]; reasoning?: string }> };
	context: { roster?: Array<Record<string, unknown>>; allCyclists?: Array<{ id: number; firstName?: string; lastName?: string }> };
	transferResult?: { valid?: boolean; transferCost?: number } | null;
	currentLineup?: { riders?: Array<Record<string, unknown>> } | null;
	submitted?: boolean;
	allowTransfers?: boolean;
}): ManagePreviewView {
	const roster = result.context.roster ?? [];
	const proposedLineup = lineupFromDecision(result.decision.lineup ?? [], roster);
	const currentLineup = lineupFromApiLineup(result.currentLineup ?? null);
	const transfer = result.decision.transfers?.[0];
	const executed = Boolean(result.submitted && result.allowTransfers && result.transferResult?.valid);

	return {
		currentLineup,
		proposedLineup,
		changes: computeLineupChanges(currentLineup, proposedLineup),
		transfer: buildTransferPreview(transfer, result.transferResult ?? null, result.context.allCyclists ?? [], executed)
	};
}

export function buildRosterPreview(result: {
	context: { roster?: Array<{ id: number; firstName?: string; lastName?: string; team?: { jerseyUrl?: string; name?: string; shortName?: string }; price?: number }> };
	roster?: Array<{ id: number; firstName?: string; lastName?: string; team?: { jerseyUrl?: string; name?: string; shortName?: string }; price?: number }>;
	cyclistIds?: number[];
}): RosterPreviewView {
	const currentRoster = result.context.roster ?? [];
	const proposedRoster = result.roster ?? [];
	const currentIds = new Set(currentRoster.map((cyclist) => cyclist.id));
	const proposedIds = new Set(result.cyclistIds ?? proposedRoster.map((cyclist) => cyclist.id));
	const byId = new Map(
		[...currentRoster, ...proposedRoster].map((cyclist) => [cyclist.id, cyclist])
	);

	const mapRider = (id: number) => {
		const cyclist = byId.get(id);
		return {
			id,
			name: riderName(cyclist),
			jerseyUrl: cyclist?.team?.jerseyUrl,
			team: cyclist?.team?.shortName ?? cyclist?.team?.name,
			price: cyclist?.price
		};
	};

	return {
		added: [...proposedIds].filter((id) => !currentIds.has(id)).map(mapRider),
		removed: [...currentIds].filter((id) => !proposedIds.has(id)).map(mapRider),
		unchangedCount: [...proposedIds].filter((id) => currentIds.has(id)).length
	};
}

export function buildLineupSubmitPayload(result: {
	context: { match: { id: number; name: string } };
	decision: {
		summary?: string;
		confidence?: number | string;
		lineup?: Array<{ cyclistId: number; lineupType: string }>;
		transfers?: Array<{ ridersIn?: number[]; ridersOut?: number[] }>;
	};
	transferResult?: { valid?: boolean } | null;
}): PreviewSubmitPayload | null {
	if (!result.decision?.lineup?.length) return null;

	const transfer = result.decision.transfers?.[0];
	const includeTransfer =
		result.transferResult?.valid &&
		transfer?.ridersIn?.length &&
		transfer?.ridersOut?.length;

	return {
		kind: 'lineup',
		matchId: result.context.match.id,
		matchName: result.context.match.name,
		summary: result.decision.summary,
		confidence: result.decision.confidence,
		lineup: result.decision.lineup.map((entry) => ({
			cyclistId: entry.cyclistId,
			lineupType: entry.lineupType
		})),
		transfer: includeTransfer
			? {
					ridersIn: transfer.ridersIn ?? [],
					ridersOut: transfer.ridersOut ?? []
				}
			: undefined
	};
}

export function buildRosterSubmitPayload(result: {
	decision?: { summary?: string; confidence?: number | string };
	cyclistIds?: number[];
}): PreviewSubmitPayload | null {
	if (!result.cyclistIds?.length) return null;

	return {
		kind: 'roster',
		summary: result.decision?.summary,
		confidence: result.decision?.confidence,
		cyclistIds: [...result.cyclistIds]
	};
}
