<script lang="ts">
	import RiderAvatar from '$lib/components/RiderAvatar.svelte';
	import type { OverviewData } from '$lib/types/overview';

	let { overview = null }: { overview?: OverviewData | null } = $props();

	const gs = $derived(overview?.gameStatus);
	const ui = $derived(overview?.ui);
	const rosterPreview = $derived(overview?.rosterPreview ?? []);
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

	{#if rosterPreview.length > 0}
		<div class="card mb-4">
			<p class="mb-3 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">
				Jouw ploeg
			</p>
			<ul class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
				{#each rosterPreview as rider (rider.id)}
					<li
						class="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1.5"
						title="{rider.name}{rider.team ? ` · ${rider.team}` : ''}"
					>
						<RiderAvatar jerseyUrl={rider.jerseyUrl} name={rider.name} size="sm" />
						<div class="min-w-0">
							<p class="truncate text-xs font-medium text-slate-200">{rider.name.split(' ').at(-1)}</p>
							{#if rider.price != null}
								<p class="text-[0.65rem] text-slate-500">€{rider.price}M</p>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
{/if}
