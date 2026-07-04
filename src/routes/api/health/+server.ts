import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSettings } from '$lib/server/config.js';

export const GET: RequestHandler = async () => {
	const settings = getSettings();
	return json({
		ok: true,
		edition: settings.editionSlug,
		uptimeSec: Math.floor(process.uptime())
	});
};
