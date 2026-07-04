<script lang="ts">
	import { onMount } from 'svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import WorkflowBar from '$lib/components/WorkflowBar.svelte';
	import StagePanel from '$lib/components/StagePanel.svelte';
	import ActionBar from '$lib/components/ActionBar.svelte';
	import LogPanel from '$lib/components/LogPanel.svelte';
	import DecisionHistory from '$lib/components/DecisionHistory.svelte';
	import SimulatePreview from '$lib/components/SimulatePreview.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { KeyRound } from '@lucide/svelte';
	import { askConfirm, closeConfirm, createConfirmDialogState } from '$lib/confirm-dialog';
	import {
		applyPreviewEvent,
		clearPreviewState,
		createPreviewState,
		runDashboardJob
	} from '$lib/dashboard-jobs.svelte';
	import { dashboardFetch, dashboardLogsUrl } from '$lib/dashboard-api';
	import type { OverviewData } from '$lib/types/overview';
	import type { SseEvent } from '$lib/types/sse';
	import type LogPanelComponent from '$lib/components/LogPanel.svelte';
	import type DecisionHistoryComponent from '$lib/components/DecisionHistory.svelte';
	import type { ConnectionStatus } from '$lib/types/connection';

	let { data } = $props();

	const autoManageWindowMs = $derived(data.autoManageWindowMs);

	let connectionStatus = $state<ConnectionStatus>('connecting');
	let authBusy = $state(false);
	let overview = $state<OverviewData | null>(null);
	let overviewLoading = $state(true);
	let overviewError = $state('');
	let jobBusy = $state(false);
	let jobBusyLabel = $state('');
	let includeTransfer = $state(true);
	let preview = $state(createPreviewState());
	let submitBusy = $state(false);
	let logPanel: LogPanelComponent | undefined = $state();
	let decisionHistory: DecisionHistoryComponent | undefined = $state();
	let confirmDialog = $state(createConfirmDialogState());

	const dashboardKey = $derived(data.dashboardKey);
	const logsUrl = $derived(dashboardLogsUrl(dashboardKey));
	const showPreview = $derived(
		Boolean(
			preview.previewSummary ||
				preview.previewReasoning ||
				preview.managePreview ||
				preview.rosterPreview
		)
	);

	function clearPreview() {
		clearPreviewState(preview);
		includeTransfer = true;
	}

	async function loadOverview() {
		overviewLoading = true;
		overviewError = '';
		try {
			const res = await dashboardFetch(dashboardKey, '/api/overview');
			const payload = await res.json();
			if (!res.ok) throw new Error(payload.error || 'Kon overzicht niet laden.');
			overview = payload;
		} catch (err) {
			overviewError = err instanceof Error ? err.message : 'Onbekende fout';
			overview = null;
		} finally {
			overviewLoading = false;
		}
	}

	function refreshDashboard() {
		loadOverview();
		decisionHistory?.refresh();
	}

	const canSubmitPreview = $derived(Boolean(!preview.previewSubmitted && preview.submitPayload));
	const hasPendingTransfer = $derived(
		Boolean(preview.managePreview?.transfer && !preview.managePreview.transfer.executed)
	);

	function applyManage(data: Extract<SseEvent, { type: 'manage' }>) {
		jobBusy = false;
		jobBusyLabel = '';
		submitBusy = false;
		applyPreviewEvent(preview, 'manage', data);
		includeTransfer = preview.includeTransfer;
	}

	function handleManageFailed(data: Extract<SseEvent, { type: 'manage-failed' }>) {
		jobBusy = false;
		jobBusyLabel = '';
		logPanel?.addLog(`❌ Mislukt${data.reason ? `: ${data.reason}` : ''}`, 30);
	}

	function applyRoster(data: Extract<SseEvent, { type: 'roster' }>) {
		jobBusy = false;
		jobBusyLabel = '';
		submitBusy = false;
		applyPreviewEvent(preview, 'roster', data);
	}

	function handleRosterFailed(data: Extract<SseEvent, { type: 'roster-failed' }>) {
		jobBusy = false;
		jobBusyLabel = '';
		logPanel?.addLog(`❌ Ploeg mislukt${data.reason ? `: ${data.reason}` : ''}`, 30);
	}

	async function submitPreview() {
		if (!preview.submitPayload) return;

		const submitPayload = preview.submitPayload;

		const title =
			submitPayload.kind === 'roster'
				? 'Ploegvoorstel indienen'
				: 'Lineup-voorstel indienen';

		const transferNote =
			hasPendingTransfer && includeTransfer
				? '\n\nInclusief de voorgestelde transfer.'
				: hasPendingTransfer
					? '\n\nZonder transfer — enkel lineup.'
					: '';

		const description =
			submitPayload.kind === 'roster'
				? 'Dit AI-ploegvoorstel wordt ingediend bij Sporza.'
				: `Dit lineup-voorstel wordt ingediend voor ${submitPayload.matchName ?? 'deze rit'}.${submitPayload.summary ? `\n\n${submitPayload.summary}` : ''}${transferNote}`;

		if (!(await askConfirm(confirmDialog, { title, description, confirmLabel: 'Indienen bij Sporza' }))) {
			return;
		}

		submitBusy = true;
		try {
			const res = await dashboardFetch(dashboardKey, '/api/run/submit-preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...submitPayload, includeTransfer })
			});
			const payload = await res.json();
			if (!res.ok) throw new Error(payload.error || 'Indienen mislukt.');

			preview.previewSubmitted = true;
			preview.submitPayload = null;
			refreshDashboard();
			logPanel?.addLog('✅ Simulatie ingediend bij Sporza.', 30);
		} catch (err) {
			logPanel?.addLog(`❌ ${err instanceof Error ? err.message : 'Indienen mislukt.'}`, 30);
		} finally {
			submitBusy = false;
		}
	}

	async function runManage(dryRun: boolean) {
		const matchId = overview?.upcomingMatch?.id;
		if (!matchId) return;

		const params = new URLSearchParams({ matchId: String(matchId) });
		if (dryRun) params.set('dryRun', '1');

		await runDashboardJob({
			dashboardKey,
			endpoint: `/api/run/manage?${params}`,
			dryRun,
			confirmDialog,
			confirm: dryRun
				? undefined
				: {
						title: 'Direct indienen',
						description:
							'AI draait opnieuw en dient meteen in bij Sporza — zonder preview, diff of transfer. Weet je het zeker?',
						confirmLabel: 'Direct indienen'
					},
			onStart: () => {
				jobBusy = true;
				jobBusyLabel = dryRun ? 'AI-voorstel maken…' : 'Direct indienen bij Sporza…';
				clearPreview();
			},
			onError: (message) => {
				jobBusy = false;
				jobBusyLabel = '';
				logPanel?.addLog(`❌ ${message}`, 30);
			}
		});
	}

	async function runRoster(dryRun: boolean) {
		const params = new URLSearchParams();
		if (dryRun) params.set('dryRun', '1');
		const query = params.toString() ? `?${params}` : '';

		await runDashboardJob({
			dashboardKey,
			endpoint: `/api/run/roster${query}`,
			dryRun,
			confirmDialog,
			confirm: dryRun
				? undefined
				: {
						title: 'Direct indienen',
						description:
							'AI stelt een nieuwe ploeg samen en dient meteen in bij Sporza — zonder preview. Weet je het zeker?',
						confirmLabel: 'Direct indienen'
					},
			onStart: () => {
				jobBusy = true;
				jobBusyLabel = dryRun ? 'AI-voorstel maken…' : 'Direct indienen bij Sporza…';
				clearPreview();
			},
			onError: (message) => {
				jobBusy = false;
				jobBusyLabel = '';
				logPanel?.addLog(`❌ ${message}`, 30);
			}
		});
	}

	function handlePrimary() {
		const action = overview?.ui?.primaryAction;
		if (action === 'roster_simulate') runRoster(true);
		else if (action === 'manage_simulate') runManage(true);
	}

	function handleSecondary() {
		const action = overview?.ui?.primaryAction;
		if (action === 'roster_simulate') runRoster(false);
		else if (action === 'manage_simulate') runManage(false);
	}

	async function triggerAuthRefresh() {
		authBusy = true;
		try {
			await dashboardFetch(dashboardKey, '/api/run/auth-refresh', { method: 'POST' });
			logPanel?.addLog('Auth refresh gestart', 30);
		} finally {
			setTimeout(() => {
				authBusy = false;
				loadOverview();
			}, 1500);
		}
	}

	onMount(() => {
		loadOverview();
		const interval = setInterval(loadOverview, 60_000);
		return () => clearInterval(interval);
	});
</script>

<header class="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800/60 pb-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight text-zinc-50">Sporza Wielermanager</h1>
		<p class="mt-1 text-sm text-zinc-500">
			Auto-manage {Math.round(autoManageWindowMs / 60_000)} min voor elke deadline
		</p>
	</div>
	<div class="flex items-center gap-3">
		<button
			class="btn-secondary"
			type="button"
			disabled={authBusy || overview?.auth?.canRefresh === false}
			onclick={triggerAuthRefresh}
		>
			<KeyRound class="size-4" />
			Auth
		</button>
		<StatusPill status={connectionStatus} />
	</div>
</header>

{#if overviewLoading && !overview}
	<div class="space-y-4" aria-busy="true" aria-label="Dashboard laden">
		<div class="card flex flex-wrap gap-x-6 gap-y-3">
			{#each [1, 2, 3, 4, 5] as i (i)}
				<div class="space-y-2">
					<div class="skeleton h-3 w-12"></div>
					<div class="skeleton h-4 w-20"></div>
				</div>
			{/each}
		</div>
		<div class="card flex gap-3">
			<div class="skeleton size-7 rounded-full"></div>
			<div class="flex-1 space-y-2">
				<div class="skeleton h-4 w-24"></div>
				<div class="skeleton h-3 w-32"></div>
			</div>
			<div class="skeleton size-7 rounded-full"></div>
			<div class="flex-1 space-y-2">
				<div class="skeleton h-4 w-20"></div>
				<div class="skeleton h-3 w-28"></div>
			</div>
		</div>
		<div class="card-hero p-4">
			<div class="skeleton mb-2 h-3 w-20"></div>
			<div class="skeleton mb-2 h-6 w-3/4"></div>
			<div class="skeleton h-4 w-1/2"></div>
		</div>
	</div>
{:else if overviewError}
	<p class="text-sm text-red-400">{overviewError}</p>
{:else if overview?.ui}
	<StatusBar {overview} />
	<WorkflowBar ui={overview.ui} />
{/if}

<LogPanel
	bind:this={logPanel}
	{logsUrl}
	bind:connectionStatus
	onManage={applyManage}
	onRoster={applyRoster}
	onManageFailed={handleManageFailed}
	onRosterFailed={handleRosterFailed}
	onOverviewRefresh={refreshDashboard}
/>

<div class="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
	<div class="min-w-0 space-y-4">
		<StagePanel stage={overview?.upcomingMatch ?? null} lineup={overview?.upcomingLineup ?? null} />

		{#if showPreview}
			<SimulatePreview
				summary={preview.previewSummary}
				reasoning={preview.previewReasoning}
				submitted={preview.previewSubmitted}
				managePreview={preview.managePreview}
				rosterPreview={preview.rosterPreview}
				canSubmit={canSubmitPreview}
				{submitBusy}
				{hasPendingTransfer}
				bind:includeTransfer
				transferState={overview?.transferState ?? null}
				onsubmit={submitPreview}
			/>
		{/if}
	</div>

	<aside class="space-y-4">
		{#if overview?.ui}
			<ActionBar
				ui={overview.ui}
				busy={jobBusy}
				busyLabel={jobBusyLabel}
				onprimary={handlePrimary}
				onsecondary={handleSecondary}
				onrefresh={refreshDashboard}
			/>
		{/if}

		<DecisionHistory bind:this={decisionHistory} {dashboardKey} />
	</aside>
</div>

<ConfirmModal
	open={confirmDialog.open}
	title={confirmDialog.title}
	description={confirmDialog.description}
	confirmLabel={confirmDialog.confirmLabel}
	cancelLabel={confirmDialog.cancelLabel}
	busy={confirmDialog.busy}
	onconfirm={() => closeConfirm(confirmDialog, true)}
	oncancel={() => closeConfirm(confirmDialog, false)}
/>
