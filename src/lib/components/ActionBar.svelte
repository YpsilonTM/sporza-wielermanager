<script lang="ts">
	import { RefreshCw } from '@lucide/svelte';
	import type { OverviewUiState } from '$lib/types/overview';

	let {
		ui,
		busy = false,
		busyLabel = '',
		onprimary,
		onsecondary,
		onrefresh
	}: {
		ui: OverviewUiState;
		busy?: boolean;
		busyLabel?: string;
		onprimary?: () => void;
		onsecondary?: () => void;
		onrefresh?: () => void;
	} = $props();
</script>

<section class="card">
	<div class="mb-3 flex items-center justify-between gap-2">
		<h3 class="section-title">Wat wil je doen?</h3>
		<button
			class="btn-icon"
			type="button"
			title="Status vernieuwen"
			onclick={onrefresh}
		>
			<RefreshCw class="size-4" />
		</button>
	</div>

	<p class="mb-4 text-sm leading-relaxed text-zinc-400">{ui.primaryDescription}</p>

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
			class="w-full text-sm text-zinc-500 underline underline-offset-2 transition hover:text-zinc-300 disabled:opacity-40"
			type="button"
			disabled={busy}
			onclick={onsecondary}
		>
			{ui.secondaryLabel}
		</button>
	{:else}
		<p class="text-sm text-zinc-500">Geen actie beschikbaar op dit moment.</p>
	{/if}

	{#if busy}
		<p class="mt-3 text-xs text-amber-300/90">
			AI werkt… het voorstel verschijnt in de diff (1–2 min).
		</p>
	{:else if ui.primaryAction === 'manage_simulate' || ui.primaryAction === 'roster_simulate'}
		<p class="mt-3 meta-text">
			Daarna kun je in de diff lineup en eventuele transfer goedkeuren voor je indient.
		</p>
	{/if}
</section>

{#if ui.showRosterActions}
	<section class="card mt-3 opacity-90">
		<h3 class="text-sm font-semibold text-zinc-300">Ploeg opnieuw samenstellen</h3>
		<p class="mt-1 meta-text">
			Alleen nodig bij een lege of onvolledige ploeg. Dit vervangt je huidige selectie.
		</p>
	</section>
{/if}
