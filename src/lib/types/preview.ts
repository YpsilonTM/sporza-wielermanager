export interface LineupChangeView {
	id: number;
	name: string;
	from?: string;
	to?: string;
	change: 'role' | 'starter' | 'bench' | 'added' | 'removed';
}

export interface TransferPreviewView {
	ridersOut: Array<{ id: number; name: string }>;
	ridersIn: Array<{ id: number; name: string }>;
	cost: number;
	reasoning?: string;
	executed: boolean;
}

export interface ManagePreviewView {
	currentLineup: import('./overview').LineupView | null;
	proposedLineup: import('./overview').LineupView;
	changes: LineupChangeView[];
	transfer: TransferPreviewView | null;
	source?: string | null;
}

export interface RosterPreviewView {
	added: Array<{ id: number; name: string; jerseyUrl?: string; team?: string; price?: number }>;
	removed: Array<{ id: number; name: string; jerseyUrl?: string; team?: string; price?: number }>;
	unchangedCount: number;
}

export interface PreviewSubmitPayload {
	kind: 'lineup' | 'roster';
	matchId?: number;
	matchName?: string;
	summary?: string;
	confidence?: number | string;
	lineup?: Array<{ cyclistId: number; lineupType: string }>;
	transfer?: { ridersIn: number[]; ridersOut: number[] };
	cyclistIds?: number[];
}
