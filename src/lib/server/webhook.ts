import { pinoLogger } from './logger';

export interface WebhookPayload {
	event: string;
	title: string;
	message: string;
	submitted?: boolean;
	matchId?: number;
	matchName?: string;
	autoManaged?: boolean;
}

export async function notifyWebhook(payload: WebhookPayload): Promise<void> {
	const url = process.env.NOTIFY_WEBHOOK_URL?.trim();
	if (!url) return;

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				...payload,
				app: 'sporza-wielermanager',
				timestamp: new Date().toISOString()
			})
		});

		if (!response.ok) {
			pinoLogger.warn(`Webhook ${payload.event} failed: HTTP ${response.status}`);
		}
	} catch (error) {
		pinoLogger.warn(
			`Webhook ${payload.event} error: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}
