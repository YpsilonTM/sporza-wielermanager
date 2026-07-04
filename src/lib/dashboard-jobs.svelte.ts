import type { ConfirmDialogState } from '$lib/confirm-dialog';
import { askConfirm } from '$lib/confirm-dialog';
import { dashboardFetch } from '$lib/dashboard-api';
import type { ManagePreviewView, PreviewSubmitPayload, RosterPreviewView } from '$lib/types/preview';
import type { SseEvent } from '$lib/types/sse';

export type PreviewState = {
	previewSummary: string;
	previewReasoning: string;
	previewSubmitted: boolean;
	managePreview: ManagePreviewView | null;
	rosterPreview: RosterPreviewView | null;
	submitPayload: PreviewSubmitPayload | null;
	includeTransfer: boolean;
};

export function createPreviewState(): PreviewState {
	return {
		previewSummary: '',
		previewReasoning: '',
		previewSubmitted: false,
		managePreview: null,
		rosterPreview: null,
		submitPayload: null,
		includeTransfer: true
	};
}

export function clearPreviewState(state: PreviewState): void {
	Object.assign(state, createPreviewState());
}

export function applyPreviewEvent(
	state: PreviewState,
	type: 'manage' | 'roster',
	data: Extract<SseEvent, { type: 'manage' }> | Extract<SseEvent, { type: 'roster' }>
): void {
	state.previewSummary = data.summary;
	state.previewReasoning = data.reasoning || '';
	state.previewSubmitted = data.submitted;

	if (type === 'manage') {
		const manageData = data as Extract<SseEvent, { type: 'manage' }>;
		state.managePreview = manageData.preview ?? null;
		state.rosterPreview = null;
		state.includeTransfer = Boolean(
			state.managePreview?.transfer && !state.managePreview.transfer.executed
		);
	} else {
		const rosterData = data as Extract<SseEvent, { type: 'roster' }>;
		state.rosterPreview = rosterData.preview ?? null;
		state.managePreview = null;
	}

	state.submitPayload = data.submitted ? null : (data.submit ?? null);
}

type RunJobOptions = {
	dashboardKey: string | null;
	endpoint: string;
	dryRun: boolean;
	confirmDialog: ConfirmDialogState;
	confirm?: { title: string; description: string; confirmLabel: string };
	onStart: () => void;
	onError: (message: string) => void;
};

export async function runDashboardJob(options: RunJobOptions): Promise<void> {
	if (!options.dryRun && options.confirm) {
		const confirmed = await askConfirm(options.confirmDialog, options.confirm);
		if (!confirmed) return;
	}

	options.onStart();

	try {
		const res = await dashboardFetch(options.dashboardKey, options.endpoint, { method: 'POST' });
		if (res.status === 202) return;
		if (!res.ok) {
			const text = await res.text();
			let message = text || 'Actie mislukt.';
			try {
				const payload = JSON.parse(text);
				message = payload.error || message;
			} catch {
				// keep text fallback
			}
			throw new Error(message);
		}
	} catch (err) {
		options.onError(err instanceof Error ? err.message : 'Onbekende fout');
	}
}
