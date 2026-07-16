import { pinoLogger } from './logger';

export interface WebhookPayload {
	event: string;
	title: string;
	message: string;
	submitted?: boolean;
	matchId?: number;
	matchName?: string;
	autoManaged?: boolean;
	confidence?: number | string | null;
	source?: string | null;
	reason?: string | null;
}

function isDiscordWebhook(url: string): boolean {
	return /discord(?:app)?\.com\/api\/webhooks\//i.test(url);
}

function formatDiscordContent(payload: WebhookPayload): string {
	const lines = [`**${payload.title}**`, payload.message];
	if (payload.matchName) lines.push(`Rit: ${payload.matchName}`);
	if (payload.source) lines.push(`Bron: ${payload.source}`);
	if (payload.confidence != null) lines.push(`Confidence: ${payload.confidence}`);
	if (payload.reason) lines.push(`Reden: ${payload.reason}`);
	return lines.filter(Boolean).join('\n').slice(0, 1900);
}

export async function notifyWebhook(payload: WebhookPayload): Promise<void> {
	const url = process.env.NOTIFY_WEBHOOK_URL?.trim();
	if (!url) return;

	try {
		const body = isDiscordWebhook(url)
			? { content: formatDiscordContent(payload) }
			: {
					...payload,
					app: 'sporza-wielermanager',
					timestamp: new Date().toISOString()
				};

		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
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
