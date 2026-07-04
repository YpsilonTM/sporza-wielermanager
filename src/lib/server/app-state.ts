let manageRunning = false;
let overviewCache: unknown = null;
let overviewCacheTime = 0;
const manageInFlight = new Set<number>();
let rosterRunning = false;

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

export function markManageInFlight(matchId: number): void {
	manageInFlight.add(matchId);
}

export function clearManageInFlight(matchId: number): void {
	manageInFlight.delete(matchId);
}

export function isManageInFlight(matchId: number): boolean {
	return manageInFlight.has(matchId);
}

export function getRosterRunning(): boolean {
	return rosterRunning;
}

export function setRosterRunning(value: boolean): void {
	rosterRunning = value;
}
