import type { Cookies } from '@sveltejs/kit';

const COOKIE_NAME = 'dashboard_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const PROTECTED_PREFIXES = ['/api/run/', '/api/logs', '/api/decisions/'];

export function getDashboardApiKey(): string | null {
	const key = process.env.DASHBOARD_API_KEY?.trim();
	return key || null;
}

export function isDashboardAuthRequired(): boolean {
	return Boolean(getDashboardApiKey());
}

export function isProtectedDashboardPath(pathname: string): boolean {
	return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function extractDashboardKey(request: Request): string | null {
	const header = request.headers.get('x-dashboard-key')?.trim();
	if (header) return header;
	return new URL(request.url).searchParams.get('key')?.trim() || null;
}

export function isDashboardKeyValid(provided: string | null): boolean {
	const expected = getDashboardApiKey();
	if (!expected) return true;
	return provided === expected;
}

export function hasDashboardAuthCookie(cookies: Cookies): boolean {
	return cookies.get(COOKIE_NAME) === '1';
}

export function setDashboardAuthCookie(cookies: Cookies): void {
	cookies.set(COOKIE_NAME, '1', {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		maxAge: COOKIE_MAX_AGE
	});
}

export function isDashboardAuthorized(request: Request, cookies: Cookies): boolean {
	if (!isDashboardAuthRequired()) return true;

	const provided = extractDashboardKey(request);
	if (isDashboardKeyValid(provided)) {
		setDashboardAuthCookie(cookies);
		return true;
	}

	return hasDashboardAuthCookie(cookies);
}
