<script lang="ts">
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

<section class="action-panel">
	<div class="action-panel-header">
		<h3>Wat wil je doen?</h3>
		<button class="btn-icon" type="button" title="Status vernieuwen" onclick={onrefresh}>↻</button>
	</div>

	<p class="action-description">{ui.primaryDescription}</p>

	{#if ui.primaryAction}
		<div class="action-primary-row">
			<button
				class="btn-primary btn-large"
				type="button"
				disabled={busy}
				onclick={onprimary}
			>
				{#if busy}
					<span class="spinner" aria-hidden="true"></span>
					{busyLabel || 'Bezig…'}
				{:else}
					{ui.primaryLabel}
				{/if}
			</button>
		</div>

		<button class="btn-simulate" type="button" disabled={busy} onclick={onsecondary}>
			{ui.secondaryLabel}
		</button>
	{:else}
		<p class="action-muted">Geen actie beschikbaar op dit moment.</p>
	{/if}

	{#if busy}
		<p class="loading-msg">AI werkt… resultaat verschijnt in de live logs (1–2 min).</p>
	{/if}
</section>

{#if ui.showRosterActions}
	<section class="action-panel secondary-panel">
		<h3>Ploeg opnieuw samenstellen</h3>
		<p class="action-description">
			Alleen nodig bij een lege of onvolledige ploeg. Dit vervangt je huidige selectie.
		</p>
	</section>
{/if}
