import type { ManagePreviewView, PreviewSubmitPayload, RosterPreviewView } from '$lib/types/preview';

export interface SseLogEvent {
	type: 'log';
	level: number;
	message: string;
}

export interface SseManageEvent {
	type: 'manage';
	matchId: number;
	matchName: string;
	summary: string;
	confidence?: number | string;
	reasoning?: string;
	submitted: boolean;
	autoManaged?: boolean;
	preview?: ManagePreviewView;
	submit?: PreviewSubmitPayload;
}

export interface SseRosterEvent {
	type: 'roster';
	summary: string;
	submitted: boolean;
	reasoning?: string;
	preview?: RosterPreviewView;
	submit?: PreviewSubmitPayload;
}

export interface SseManageFailedEvent {
	type: 'manage-failed';
	matchId?: number;
	reason?: string;
}

export interface SseRosterFailedEvent {
	type: 'roster-failed';
	reason?: string;
}

export type SseEvent =
	| SseLogEvent
	| SseManageEvent
	| SseRosterEvent
	| SseManageFailedEvent
	| SseRosterFailedEvent;
