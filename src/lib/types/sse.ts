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
	confidence?: number;
	reasoning?: string;
	submitted: boolean;
	autoManaged?: boolean;
}

export interface SseRosterEvent {
	type: 'roster';
	summary: string;
	submitted: boolean;
	reasoning?: string;
}

export interface SseManageFailedEvent {
	type: 'manage-failed';
	matchId?: number;
	reason?: string;
}

export type SseEvent = SseLogEvent | SseManageEvent | SseRosterEvent | SseManageFailedEvent;
