<script lang="ts">
	import { onMount } from 'svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import WorkflowBar from '$lib/components/WorkflowBar.svelte';
	import StagePanel from '$lib/components/StagePanel.svelte';
	import ActionBar from '$lib/components/ActionBar.svelte';
	import LogPanel from '$lib/components/LogPanel.svelte';
	import type { OverviewData } from '$lib/types/overview';
	import type LogPanelComponent from '$lib/components/LogPanel.svelte';
	import type { SseEvent } from '$lib/types/sse';

	const AUTO_MANAGE_WINDOW_MS = 60 * 60 * 1000;

	let connectionStatus = $state('Verbinden met log stream...');
	let authBusy = $state(false);
	let overview = $state<OverviewData | null>(null);
	let overviewLoading = $state(true);
	let overviewError = $state('');
	let jobBusy = $state(false);
	let jobBusyLabel = $state('');
	let previewSummary = $state('');
	let previewReasoning = $state('');
	let logPanel: LogPanelComponent | undefined = $state();

	async function loadOverview() {
		overviewLoading = true;
		overviewError = '';
		try {
			const res = await fetch('/api/overview');
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Kon overzicht niet laden.');
			overview = data;
		} catch (err) {
			overviewError = err instanceof Error ? err.message : 'Onbekende fout';
			overview = null;
		} finally {
			overviewLoading = false;
		}
	}

	function applyManage(data: Extract<SseEvent, { type: 'manage' }>) {
		jobBusy = false;
		jobBusyLabel = '';
		previewSummary = data.summary;
		previewReasoning = data.reasoning || '';
	}

	function handleManageFailed(data: Extract<SseEvent, { type: 'manage-failed' }>) {
		jobBusy = false;
		jobBusyLabel = '';
		logPanel?.addLog(`❌ Mislukt${data.reason ? `: ${data.reason}` : ''}`, 30);
	}

	function applyRoster(data: Extract<SseEvent, { type: 'roster' }>) {
		jobBusy = false;
		jobBusyLabel = '';
		previewSummary = data.summary;
		previewReasoning = data.reasoning || '';
	}

	async function runManage(dryRun: boolean) {
		const matchId = overview?.upcomingMatch?.id;
		if (!matchId) return;

		if (!dryRun) {
			const label = overview?.ui?.primaryLabel ?? 'deze actie';
			if (!confirm(`${label} en indienen bij Sporza?`)) return;
		}

		jobBusy = true;
		jobBusyLabel = dryRun ? 'Simulatie bezig…' : 'Indienen bij Sporza…';

		try {
			const params = new URLSearchParams({ matchId: String(matchId) });
			if (dryRun) params.set('dryRun', '1');
			const res = await fetch(`/api/run/manage?${params}`, { method: 'POST' });
			if (res.status === 202) return;
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || 'Actie mislukt.');
			}
		} catch (err) {
			jobBusy = false;
			jobBusyLabel = '';
			logPanel?.addLog(`❌ ${err instanceof Error ? err.message : 'Onbekende fout'}`, 30);
		}
	}

	async function runRoster(dryRun: boolean) {
		if (!dryRun && !confirm('Nieuwe ploeg samenstellen en indienen bij Sporza?')) return;

		jobBusy = true;
		jobBusyLabel = dryRun ? 'Simulatie bezig…' : 'Ploeg indienen…';

		try {
			const params = dryRun ? '?dryRun=1' : '';
			const res = await fetch(`/api/run/roster${params}`, { method: 'POST' });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Ploeg samenstellen mislukt.');
			if (dryRun) {
				jobBusy = false;
				jobBusyLabel = '';
			}
		} catch (err) {
			jobBusy = false;
			jobBusyLabel = '';
			logPanel?.addLog(`❌ ${err instanceof Error ? err.message : 'Onbekende fout'}`, 30);
		}
	}

	function handlePrimary() {
		const action = overview?.ui?.primaryAction;
		if (action === 'roster_submit') runRoster(false);
		else if (action === 'manage_submit') runManage(false);
	}

	function handleSecondary() {
		const action = overview?.ui?.primaryAction;
		if (action === 'roster_submit') runRoster(true);
		else if (action === 'manage_submit') runManage(true);
	}

	async function triggerAuthRefresh() {
		authBusy = true;
		try {
			await fetch('/api/run/auth-refresh', { method: 'POST' });
			logPanel?.addLog('Auth refresh gestart', 30);
		} finally {
			setTimeout(() => {
				authBusy = false;
			}, 1500);
		}
	}

	onMount(() => {
		loadOverview();
		const interval = setInterval(loadOverview, 60_000);
		return () => clearInterval(interval);
	});
</script>

<header class="mb-6 flex flex-wrap items-start justify-between gap-4">
	<div>
		<h1 class="text-2xl font-bold tracking-tight text-white">🚴 Sporza Wielermanager</h1>
		<p class="mt-1 text-sm text-slate-400">
			Auto-manage {Math.round(AUTO_MANAGE_WINDOW_MS / 60_000)} min voor elke deadline
		</p>
	</div>
	<div class="flex items-center gap-3">
		<button class="btn-secondary" type="button" disabled={authBusy} onclick={triggerAuthRefresh}>
			🔑 Auth
		</button>
		<span class="text-xs text-slate-500">{connectionStatus}</span>
	</div>
</header>

{#if overviewLoading && !overview}
	<p class="text-sm text-slate-400">Laden…</p>
{:else if overviewError}
	<p class="text-sm text-red-400">{overviewError}</p>
{:else if overview?.ui}
	<StatusBar {overview} />
	<WorkflowBar ui={overview.ui} />
{/if}

<LogPanel
	bind:this={logPanel}
	bind:connectionStatus
	onManage={applyManage}
	onRoster={applyRoster}
	onManageFailed={handleManageFailed}
	onOverviewRefresh={loadOverview}
/>

<div class="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
	<div class="min-w-0 space-y-4">
		<StagePanel stage={overview?.upcomingMatch ?? null} lineup={overview?.upcomingLineup ?? null} />

		{#if previewSummary || previewReasoning}
			<details class="card group" open>
				<summary class="cursor-pointer list-none">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-xs font-semibold uppercase tracking-wider text-emerald-400">
								Laatste AI-resultaat
							</p>
							{#if previewSummary}
								<p class="mt-1 line-clamp-2 text-sm text-slate-400">{previewSummary}</p>
							{/if}
						</div>
						<span class="text-xs text-slate-500 transition group-open:rotate-180">▼</span>
					</div>
				</summary>
				<div class="mt-3 space-y-2 border-t border-slate-700/80 pt-3 text-sm text-slate-400">
					{#if previewSummary}
						<p><span class="font-semibold text-slate-300">Samenvatting:</span> {previewSummary}</p>
					{/if}
					{#if previewReasoning}
						<p><span class="font-semibold text-slate-300">Reden:</span> {previewReasoning}</p>
					{/if}
				</div>
			</details>
		{/if}
	</div>

	<aside>
		{#if overview?.ui}
			<ActionBar
				ui={overview.ui}
				busy={jobBusy}
				busyLabel={jobBusyLabel}
				onprimary={handlePrimary}
				onsecondary={handleSecondary}
				onrefresh={loadOverview}
			/>
		{/if}
	</aside>
</div>
