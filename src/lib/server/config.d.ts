import type { Settings } from '$lib/types/settings';

export function getDataDir(): string;
export function getDataPath(filename: string): string;
export function ensureDataDir(): Promise<void>;
export function getSettings(): Settings;
export function getCookiesCachePath(settings: Settings): string;
export function getDatabaseUrl(): string;
export const AUTO_MANAGE_WINDOW_MS: number;
