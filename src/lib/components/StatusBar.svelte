<script lang="ts">
	import type { OverviewData } from '$lib/types/overview';

	let { overview = null }: { overview?: OverviewData | null } = $props();

	const gs = $derived(overview?.gameStatus);
	const ui = $derived(overview?.ui);
</script>

{#if overview && ui}
	<div class="stats-bar compact">
		<div class="stat-item">
			<span class="stat-label">Speler</span>
			<span class="stat-value">{gs?.user?.name ?? '—'}</span>
		</div>
		<div class="stat-item">
			<span class="stat-label">Ploeg</span>
			<span class="stat-value">
				{ui.rosterCount}/{ui.squadSize}
				{#if ui.rosterComplete}
					<span class="badge ok">compleet</span>
				{:else}
					<span class="badge warn">onvolledig</span>
				{/if}
			</span>
		</div>
		{#if overview.transferState}
			<div class="stat-item">
				<span class="stat-label">Budget</span>
				<span class="stat-value">€{overview.transferState.remainingBudget}M</span>
			</div>
		{/if}
		<div class="stat-item">
			<span class="stat-label">Lineup</span>
			<span class="stat-value">
				{#if ui.lineupSubmitted}
					<span class="badge ok">ingediend</span>
				{:else}
					<span class="badge warn">open</span>
				{/if}
			</span>
		</div>
	</div>
{/if}
