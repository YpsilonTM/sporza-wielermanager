<script lang="ts">
	import type { OverviewData } from '$lib/types/overview';

	let { overview = null }: { overview?: OverviewData | null } = $props();

	const gs = $derived(overview?.gameStatus);
	const ui = $derived(overview?.ui);
</script>

{#if overview && ui}
	<div class="card mb-4 flex flex-wrap gap-x-6 gap-y-3">
		<div>
			<p class="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">Speler</p>
			<p class="text-sm font-semibold text-slate-100">{gs?.user?.name ?? '—'}</p>
		</div>
		<div>
			<p class="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">Ploeg</p>
			<p class="text-sm font-semibold text-slate-100">
				{ui.rosterCount}/{ui.squadSize}
				{#if ui.rosterComplete}
					<span class="badge-ok">compleet</span>
				{:else}
					<span class="badge-warn">onvolledig</span>
				{/if}
			</p>
		</div>
		{#if overview.transferState}
			<div>
				<p class="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">Budget</p>
				<p class="text-sm font-semibold text-slate-100">€{overview.transferState.remainingBudget}M</p>
			</div>
		{/if}
		<div>
			<p class="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">Lineup</p>
			<p class="text-sm font-semibold text-slate-100">
				{#if ui.lineupSubmitted}
					<span class="badge-ok">ingediend</span>
				{:else}
					<span class="badge-warn">open</span>
				{/if}
			</p>
		</div>
	</div>
{/if}
