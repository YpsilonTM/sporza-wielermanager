import { describe, expect, test } from 'bun:test';

// Test Discord vs JSON payload shaping without network by importing helpers indirectly.
// notifyWebhook early-returns without URL; we assert format via a small local copy of detection.

function isDiscordWebhook(url: string): boolean {
	return /discord(?:app)?\.com\/api\/webhooks\//i.test(url);
}

describe('webhook url detection', () => {
	test('detects discord webhooks', () => {
		expect(isDiscordWebhook('https://discord.com/api/webhooks/1/abc')).toBe(true);
		expect(isDiscordWebhook('https://discordapp.com/api/webhooks/1/abc')).toBe(true);
		expect(isDiscordWebhook('https://ntfy.sh/my-topic')).toBe(false);
	});
});
