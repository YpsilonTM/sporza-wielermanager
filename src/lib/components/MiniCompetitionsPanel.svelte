<script lang="ts">
	import { ChevronDown, ExternalLink, Trophy } from '@lucide/svelte';
	import type { MiniCompetitionView } from '$lib/types/overview';

	let {
		competitions = [],
		editionSlug = 'tour-m-26'
	}: {
		competitions?: MiniCompetitionView[];
		editionSlug?: string;
	} = $props();

	const baseUrl = 'https://wielermanager.sporza.be';

	function competitionUrl(slug: string): string {
		return `${baseUrl}/${editionSlug}/competitions/${slug}`;
	}
</script>

{#if competitions.length > 0}
	<section class="card">
		<div class="mb-3 flex items-center gap-2">
			<Trophy class="size-4 text-zinc-400" />
			<h3 class="section-title">Minicompetities</h3>
		</div>

		<ul class="space-y-3">
			{#each competitions as competition (competition.slug)}
				<li class="surface-nested overflow-hidden">
					<details class="group" open={competitions.length === 1}>
						<summary class="cursor-pointer list-none px-3 py-2.5">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="text-sm font-medium text-zinc-100">{competition.name}</p>
									<p class="mt-0.5 meta-text">
										{#if competition.myRank != null}
											Jij: #{competition.myRank}
											{#if competition.memberCount != null}
												/ {competition.memberCount}
											{/if}
											{#if competition.myPoints != null}
												· {competition.myPoints} pt
											{/if}
										{:else if competition.memberCount != null}
											{competition.memberCount} deelnemers
										{/if}
										{#if competition.owner}
											· <span class="text-zinc-400">beheerder</span>
										{/if}
									</p>
								</div>
								<ChevronDown
									class="size-4 shrink-0 text-zinc-500 transition group-open:rotate-180"
								/>
							</div>
						</summary>

						<div class="space-y-3 border-t border-zinc-800/80 px-3 pb-3 pt-3">
							{#if competition.standings.length > 0}
								<div class="overflow-x-auto">
									<table class="w-full min-w-[240px] text-left text-xs">
										<thead>
											<tr class="meta-text">
												<th class="pb-2 pr-3 font-medium">#</th>
												<th class="pb-2 pr-3 font-medium">Ploeg</th>
												<th class="pb-2 pr-3 font-medium">Speler</th>
												<th class="pb-2 text-right font-medium">Pt</th>
											</tr>
										</thead>
										<tbody>
											{#each competition.standings as entry (entry.rank + entry.teamName)}
												<tr
													class={entry.isMyTeam
														? 'bg-zinc-800/60 text-zinc-100'
														: 'text-zinc-400'}
												>
													<td class="py-1.5 pr-3 font-medium tabular-nums">{entry.rank}</td>
													<td class="max-w-[8rem] truncate py-1.5 pr-3">{entry.teamName}</td>
													<td class="max-w-[8rem] truncate py-1.5 pr-3">
														{entry.userName ?? '—'}
													</td>
													<td class="py-1.5 text-right tabular-nums">{entry.points}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
								<p class="meta-text">
									Topstand plus jouw positie wanneer die buiten de top valt.
								</p>
							{:else}
								<p class="meta-text">Nog geen klassement beschikbaar.</p>
							{/if}

							<a
								class="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition hover:text-zinc-200"
								href={competitionUrl(competition.slug)}
								target="_blank"
								rel="noopener noreferrer"
							>
								Open op Sporza
								<ExternalLink class="size-3" />
							</a>
						</div>
					</details>
				</li>
			{/each}
		</ul>
	</section>
{/if}
