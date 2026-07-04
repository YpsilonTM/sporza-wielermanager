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
		logPanel?.addLog(
			`❌ Mislukt${data.reason ? `: ${data.reason}` : ''}`,
			30
		);
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
			logPanel?.addLog(
				`❌ ${err instanceof Error ? err.message : 'Onbekende fout'}`,
				30
			);
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
			logPanel?.addLog(
				`❌ ${err instanceof Error ? err.message : 'Onbekende fout'}`,
				30
			);
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

<header class="page-header">
	<div>
		<h1>🚴 Sporza Wielermanager</h1>
		<p class="subtitle">
			Auto-manage {Math.round(AUTO_MANAGE_WINDOW_MS / 60_000)} min voor elke deadline
		</p>
	</div>
	<div class="header-actions">
		<button class="btn-secondary btn-sm" type="button" disabled={authBusy} onclick={triggerAuthRefresh}>
			🔑 Auth
		</button>
		<span class="status">{connectionStatus}</span>
	</div>
</header>

{#if overviewLoading && !overview}
	<p class="status">Laden…</p>
{:else if overviewError}
	<p class="status error-text">{overviewError}</p>
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

<div class="dashboard-layout">
	<div class="dashboard-main">
		<StagePanel stage={overview?.upcomingMatch ?? null} lineup={overview?.upcomingLineup ?? null} />

		{#if previewSummary || previewReasoning}
			<details class="match-analysis-panel preview-panel" open>
				<summary class="match-analysis-summary">
					<span class="match-analysis-summary-label">Laatste AI-resultaat</span>
					<span class="match-analysis-preview">{previewSummary}</span>
				</summary>
				<div class="match-analysis-body">
					{#if previewSummary}
						<div class="match-reasoning"><strong>Samenvatting:</strong> {previewSummary}</div>
					{/if}
					{#if previewReasoning}
						<div class="match-reasoning"><strong>Reden:</strong> {previewReasoning}</div>
					{/if}
				</div>
			</details>
		{/if}
	</div>

	<aside class="dashboard-aside">
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
