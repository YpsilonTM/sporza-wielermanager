import type { RequestHandler } from './$types';

const ALLOWED_HOST = 'api.sporza.be';
const ALLOWED_PREFIX = '/data/cycling/routeprofile/';

function isAllowedProfileUrl(raw: string): URL | null {
	try {
		const parsed = new URL(raw);
		if (parsed.protocol !== 'https:') return null;
		if (parsed.hostname !== ALLOWED_HOST) return null;
		if (!parsed.pathname.startsWith(ALLOWED_PREFIX)) return null;
		if (!parsed.pathname.endsWith('.svg')) return null;
		return parsed;
	} catch {
		return null;
	}
}

/** Sporza SVG profiles fail as cross-origin <img> in Chromium — proxy same-origin. */
function normalizeStageProfileSvg(svg: string): string {
	return svg.replace(
		/<clipPath id="road--track--clip"><rect x="0\.0" y="0\.0" width="0\.0"/,
		'<clipPath id="road--track--clip"><rect x="0.0" y="0.0" width="840.0"'
	);
}

export const GET: RequestHandler = async ({ url }) => {
	const profileUrl = url.searchParams.get('url');
	if (!profileUrl) {
		return new Response('Missing url parameter', { status: 400 });
	}

	const allowed = isAllowedProfileUrl(profileUrl);
	if (!allowed) {
		return new Response('Forbidden profile url', { status: 403 });
	}

	const upstream = await fetch(allowed.toString());
	if (!upstream.ok) {
		return new Response('Could not fetch stage profile', { status: upstream.status });
	}

	const svg = normalizeStageProfileSvg(await upstream.text());

	return new Response(svg, {
		headers: {
			'content-type': 'image/svg+xml; charset=utf-8',
			'cache-control': 'public, max-age=300'
		}
	});
};
