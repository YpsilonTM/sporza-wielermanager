<script lang="ts">
	import type { OverviewUiState, TransferStateView } from '$lib/types/overview';

	let {
		ui,
		transferState = null,
		allowTransfers = $bindable(false),
		busy = false,
		busyLabel = '',
		onprimary,
		onsecondary,
		onrefresh
	}: {
		ui: OverviewUiState;
		transferState?: TransferStateView | null;
		allowTransfers?: boolean;
		busy?: boolean;
		busyLabel?: string;
		onprimary?: () => void;
		onsecondary?: () => void;
		onrefresh?: () => void;
	} = $props();

	const showTransferToggle = $derived(
		ui.transfersOpen &&
			!ui.preRaceSquadWindow &&
			(ui.primaryAction === 'manage_simulate' || ui.primaryAction === 'manage_submit')
	);
</script>

<section class="card sticky top-4">
	<div class="mb-3 flex items-center justify-between gap-2">
		<h3 class="text-base font-semibold text-slate-100">Wat wil je doen?</h3>
		<button
			class="btn-ghost !px-2 !py-1"
			type="button"
			title="Status vernieuwen"
			onclick={onrefresh}
		>
			↻
		</button>
	</div>

	<p class="mb-4 text-sm leading-relaxed text-slate-400">{ui.primaryDescription}</p>

	{#if showTransferToggle && transferState}
		<div class="mb-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
			<label class="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
				<input class="mt-0.5 accent-emerald-500" type="checkbox" bind:checked={allowTransfers} />
				<span>
					Transfer toestaan bij indienen
					<span class="mt-1 block text-xs text-slate-500">
						{transferState.freeTransfersRemaining} gratis resterend · €{transferState.remainingBudget}M
						budget
					</span>
				</span>
			</label>
		</div>
	{/if}

	{#if ui.primaryAction}
		<button class="btn-primary mb-3 w-full !py-3" type="button" disabled={busy} onclick={onprimary}>
			{#if busy}
				<span class="spinner" aria-hidden="true"></span>
				{busyLabel || 'Bezig…'}
			{:else}
				{ui.primaryLabel}
			{/if}
		</button>

		<button
			class="w-full text-sm text-slate-500 underline underline-offset-2 transition hover:text-slate-300 disabled:opacity-40"
			type="button"
			disabled={busy}
			onclick={onsecondary}
		>
			{ui.secondaryLabel}
		</button>
	{:else}
		<p class="text-sm text-slate-500">Geen actie beschikbaar op dit moment.</p>
	{/if}

	{#if busy}
		<p class="mt-3 text-xs text-amber-300/90">
			AI werkt… het voorstel verschijnt in de diff (1–2 min).
		</p>
	{:else if ui.primaryAction === 'manage_simulate' || ui.primaryAction === 'roster_simulate'}
		<p class="mt-3 text-xs text-slate-500">
			Daarna kun je in de diff op <span class="text-slate-300">Voorstel indienen</span> klikken.
		</p>
	{/if}
</section>

{#if ui.showRosterActions}
	<section class="card mt-3 opacity-90">
		<h3 class="text-sm font-semibold text-slate-300">Ploeg opnieuw samenstellen</h3>
		<p class="mt-1 text-xs text-slate-500">
			Alleen nodig bij een lege of onvolledige ploeg. Dit vervangt je huidige selectie.
		</p>
	</section>
{/if}
