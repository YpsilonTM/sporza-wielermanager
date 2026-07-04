let manageRunning = false;
let overviewCache: unknown = null;
let overviewCacheTime = 0;
const autoManagedMatchIds = new Set<number>();
const manageInFlight = new Set<number>();

export function getManageRunning(): boolean {
	return manageRunning;
}

export function setManageRunning(value: boolean): void {
	manageRunning = value;
}

export function getOverviewCache(): { data: unknown; time: number } {
	return { data: overviewCache, time: overviewCacheTime };
}

export function setOverviewCache(data: unknown): void {
	overviewCache = data;
	overviewCacheTime = Date.now();
}

export function invalidateOverviewCache(): void {
	overviewCache = null;
	overviewCacheTime = 0;
}

export function markAutoManaged(matchId: number): void {
	autoManagedMatchIds.add(matchId);
}

export function hasAutoManaged(matchId: number): boolean {
	return autoManagedMatchIds.has(matchId);
}

export function markManageInFlight(matchId: number): void {
	manageInFlight.add(matchId);
}

export function clearManageInFlight(matchId: number): void {
	manageInFlight.delete(matchId);
}

export function isManageInFlight(matchId: number): boolean {
	return manageInFlight.has(matchId);
}
