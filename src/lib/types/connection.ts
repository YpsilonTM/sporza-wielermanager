export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
	connecting: 'Verbinden…',
	connected: 'Verbonden',
	disconnected: 'Verbinding verbroken'
};
