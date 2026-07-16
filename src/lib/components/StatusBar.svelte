<script lang="ts">
	import RiderAvatar from '$lib/components/RiderAvatar.svelte';
	import type { OverviewData } from '$lib/types/overview';

	let { overview = null }: { overview?: OverviewData | null } = $props();

	const gs = $derived(overview?.gameStatus);
	const ui = $derived(overview?.ui);
	const ranking = $derived(overview?.ranking);
	const rosterPreview = $derived(overview?.rosterPreview ?? []);
</script>

{#if overview && ui}
	<div class="card mb-4 flex flex-wrap gap-x-6 gap-y-3">
		<div>
			<p class="label-caps">Sporza</p>
			<p class="text-sm font-semibold text-zinc-100">
				{#if overview.auth.valid}
					<span class="badge-ok">ingelogd</span>
				{:else}
					<span class="badge-warn">sessie verlopen</span>
				{/if}
			</p>
		</div>
		<div>
			<p class="label-caps">Speler</p>
			<p class="text-sm font-semibold text-zinc-100">{gs?.user?.name ?? '—'}</p>
		</div>
		<div>
			<p class="label-caps">Ploeg</p>
			<p class="text-sm font-semibold text-zinc-100">
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
				<p class="label-caps">Budget</p>
				<p class="text-sm font-semibold text-zinc-100">€{overview.transferState.remainingBudget}M</p>
			</div>
		{/if}
		<div>
			<p class="label-caps">Lineup</p>
			<p class="text-sm font-semibold text-zinc-100">
				{#if ui.lineupSubmitted}
					<span class="badge-ok">ingediend</span>
				{:else}
					<span class="badge-warn">open</span>
				{/if}
			</p>
		</div>
		{#if ranking?.rank != null}
			<div>
				<p class="label-caps">Stand</p>
				<p class="text-sm font-semibold text-zinc-100">
					#{ranking.rank}
					{#if ranking.amountOfPlayers != null}
						<span class="text-zinc-500">/ {ranking.amountOfPlayers}</span>
					{/if}
				</p>
			</div>
		{/if}
		{#if ranking?.overallScore != null}
			<div>
				<p class="label-caps">Punten</p>
				<p class="text-sm font-semibold text-zinc-100">{ranking.overallScore}</p>
			</div>
		{/if}
		{#if ranking?.lastMatchScore != null}
			<div>
				<p class="label-caps">Vorige rit</p>
				<p class="text-sm font-semibold text-emerald-400">+{ranking.lastMatchScore} pt</p>
				{#if ranking.lastMatchName}
					<p class="meta-text">{ranking.lastMatchName}</p>
				{/if}
				{#if overview.lastPostMortem?.summary}
					<p class="line-clamp-2 meta-text" title={overview.lastPostMortem.summary}>
						{overview.lastPostMortem.summary}
					</p>
				{/if}
			</div>
		{/if}
	</div>

	{#if rosterPreview.length > 0}
		<div class="card mb-4">
			<p class="label-caps mb-3">Jouw ploeg</p>
			<ul class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
				{#each rosterPreview as rider (rider.id)}
					<li
						class="surface-nested flex items-center gap-2 px-2 py-1.5"
						title="{rider.name}{rider.team ? ` · ${rider.team}` : ''}"
					>
						<RiderAvatar jerseyUrl={rider.jerseyUrl} name={rider.name} size="sm" />
						<div class="min-w-0">
							<p class="truncate text-xs font-medium text-zinc-200">{rider.name.split(' ').at(-1)}</p>
							{#if rider.price != null}
								<p class="meta-text">€{rider.price}M</p>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
{/if}
