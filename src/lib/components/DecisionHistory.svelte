<script lang="ts">
	import { onMount } from 'svelte';
	import { ChevronDown, History, RefreshCw } from '@lucide/svelte';
	import { dashboardDecisionsUrl, dashboardFetch } from '$lib/dashboard-api';
	import { confidenceDisplayLabel } from '$lib/confidence';
	import { lineupChangeClass, lineupChangeLabel } from '$lib/lineup-changes';
	import { formatRoleLabel } from '$lib/format';
	import type { ManagerDecisionView } from '$lib/types/decisions';
	import type { ManagePreviewView, RosterPreviewView } from '$lib/types/preview';

	let { dashboardKey = null }: { dashboardKey?: string | null } = $props();

	let decisions = $state<ManagerDecisionView[]>([]);
	let loading = $state(true);
	let error = $state('');

	function decisionTypeLabel(type: string): string {
		if (type === 'lineup') return 'Lineup';
		if (type === 'roster') return 'Ploeg';
		return type;
	}

	function formatWhen(iso: string): string {
		return new Date(iso).toLocaleString('nl-BE', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function isManagePreview(
		preview: ManagePreviewView | RosterPreviewView | null
	): preview is ManagePreviewView {
		return Boolean(preview && 'proposedLineup' in preview);
	}

	function isRosterPreview(
		preview: ManagePreviewView | RosterPreviewView | null
	): preview is RosterPreviewView {
		return Boolean(preview && ('added' in preview || 'removed' in preview));
	}

	function reasoningLines(reasoning: string): string[] {
		return reasoning
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
	}

	function hasDetails(decision: ManagerDecisionView): boolean {
		return Boolean(
			decision.summary ||
				decision.reasoning ||
				decision.preview
		);
	}

	async function loadDecisions() {
		loading = true;
		error = '';
		try {
			const res = await dashboardFetch(dashboardKey, dashboardDecisionsUrl(dashboardKey));
			if (!res.ok) throw new Error('Kon historiek niet laden.');
			decisions = (await res.json()) as ManagerDecisionView[];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Onbekende fout';
			decisions = [];
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadDecisions();
	});

	export function refresh() {
		loadDecisions();
	}
</script>

<section class="card">
	<div class="mb-3 flex items-center justify-between gap-2">
		<h3 class="section-title">AI-beslissingen</h3>
		<button class="btn-icon" type="button" onclick={loadDecisions} disabled={loading}>
			<RefreshCw class="size-3.5 {loading ? 'animate-spin' : ''}" />
		</button>
	</div>

	{#if loading && decisions.length === 0}
		<ul class="space-y-2" aria-hidden="true">
			{#each [1, 2, 3] as i (i)}
				<li class="surface-nested px-3 py-2.5">
					<div class="skeleton mb-2 h-4 w-3/4"></div>
					<div class="skeleton h-3 w-1/2"></div>
				</li>
			{/each}
		</ul>
	{:else if error}
		<p class="text-sm text-red-400">{error}</p>
	{:else if decisions.length === 0}
		<div class="empty-state">
			<History class="size-7 text-zinc-600" strokeWidth={1.5} />
			<p class="text-sm text-zinc-500">Nog geen opgeslagen beslissingen.</p>
		</div>
	{:else}
		<ul class="space-y-2">
			{#each decisions as decision (decision.id)}
				<li class="surface-nested overflow-hidden">
					{#if hasDetails(decision)}
						<details class="group">
							<summary class="cursor-pointer list-none px-3 py-2.5">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-start justify-between gap-2">
											<div class="min-w-0">
												<p class="text-sm font-medium text-zinc-100">
													{decision.matchName ?? decisionTypeLabel(decision.decisionType)}
												</p>
												<p class="mt-0.5 meta-text">
													{decisionTypeLabel(decision.decisionType)} · {formatWhen(decision.submittedAt)}
												</p>
											</div>
											<div class="flex shrink-0 flex-wrap items-center gap-1.5">
												{#if decision.submitted}
													<span class="badge-ok">ingediend</span>
												{:else}
													<span class="badge-warn">simulatie</span>
												{/if}
												<span class="chip bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700">
													{confidenceDisplayLabel(decision.confidence)}
												</span>
												<ChevronDown
													class="size-4 shrink-0 text-zinc-500 transition group-open:rotate-180"
												/>
											</div>
										</div>
										{#if decision.summary}
											<p class="mt-2 line-clamp-2 text-sm text-zinc-400">{decision.summary}</p>
										{/if}
									</div>
								</div>
							</summary>

							<div class="space-y-4 border-t border-zinc-800/80 px-3 pb-3 pt-3">
								{#if decision.summary}
									<div>
										<p class="label-caps mb-1">Samenvatting</p>
										<p class="whitespace-pre-wrap text-sm text-zinc-300">{decision.summary}</p>
									</div>
								{/if}

								{#if isManagePreview(decision.preview)}
									{@const managePreview = decision.preview}
									{#if managePreview.transfer}
										<div class="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3">
											<p class="label-caps text-amber-300">Transfer</p>
											<div class="mt-2 grid gap-2 text-sm sm:grid-cols-2">
												<div>
													<p class="meta-text">Eruit</p>
													<ul class="mt-1 space-y-1">
														{#each managePreview.transfer.ridersOut as rider (rider.id)}
															<li class="text-red-300">− {rider.name}</li>
														{/each}
													</ul>
												</div>
												<div>
													<p class="meta-text">Erin</p>
													<ul class="mt-1 space-y-1">
														{#each managePreview.transfer.ridersIn as rider (rider.id)}
															<li class="text-emerald-400">+ {rider.name}</li>
														{/each}
													</ul>
												</div>
											</div>
											<p class="mt-2 meta-text">
												Kost: {managePreview.transfer.cost <= 0
													? 'gratis'
													: `€${managePreview.transfer.cost}M`}
												{#if managePreview.transfer.executed}
													· <span class="text-emerald-400">uitgevoerd</span>
												{:else}
													· <span class="text-amber-300">niet uitgevoerd</span>
												{/if}
											</p>
											{#if managePreview.transfer.reasoning}
												<p class="mt-1 whitespace-pre-wrap meta-text">
													{managePreview.transfer.reasoning}
												</p>
											{/if}
										</div>
									{/if}

									{#if managePreview.changes.length > 0}
										<div>
											<p class="label-caps mb-2">
												Lineup wijzigingen ({managePreview.changes.length})
											</p>
											<ul class="space-y-1.5">
												{#each managePreview.changes as change (change.id)}
													<li
														class="surface-nested flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
													>
														<span class="font-medium text-zinc-100">{change.name}</span>
														<span class="meta-text">
															{change.from ?? '—'} → {change.to ?? '—'}
														</span>
														<span
															class="chip text-[0.65rem] {lineupChangeClass(change.change)} bg-zinc-900 ring-1 ring-zinc-700"
														>
															{lineupChangeLabel(change.change)}
														</span>
													</li>
												{/each}
											</ul>
										</div>
									{/if}

									<div class="grid gap-3 sm:grid-cols-2">
										<div>
											<p class="label-caps mb-2">Huidig</p>
											{#if managePreview.currentLineup}
												<ul class="space-y-1 text-xs text-zinc-400">
													{#each managePreview.currentLineup.starters as rider (rider.id)}
														<li>{rider.name} · {formatRoleLabel(rider.role)}</li>
													{/each}
													{#each managePreview.currentLineup.bench as rider (rider.id)}
														<li class="text-zinc-500">
															{rider.name} · {formatRoleLabel(rider.role)}
														</li>
													{/each}
												</ul>
											{:else}
												<p class="meta-text">Geen ingediende lineup.</p>
											{/if}
										</div>
										<div>
											<p class="label-caps mb-2 text-zinc-300">Voorstel</p>
											<ul class="space-y-1 text-xs text-zinc-300">
												{#each managePreview.proposedLineup.starters as rider (rider.id)}
													<li>{rider.name} · {formatRoleLabel(rider.role)}</li>
												{/each}
												{#each managePreview.proposedLineup.bench as rider (rider.id)}
													<li class="text-zinc-400">
														{rider.name} · {formatRoleLabel(rider.role)}
													</li>
												{/each}
											</ul>
										</div>
									</div>
								{:else if isRosterPreview(decision.preview)}
									{@const rosterPreview = decision.preview}
									{#if rosterPreview.added.length > 0 || rosterPreview.removed.length > 0}
										<div class="grid gap-3 sm:grid-cols-2">
											{#if rosterPreview.removed.length > 0}
												<div>
													<p class="label-caps mb-2 text-red-400">Eruit</p>
													<ul class="space-y-1 text-sm text-red-300">
														{#each rosterPreview.removed as rider (rider.id)}
															<li>− {rider.name}</li>
														{/each}
													</ul>
												</div>
											{/if}
											{#if rosterPreview.added.length > 0}
												<div>
													<p class="label-caps mb-2 text-emerald-400">Erin</p>
													<ul class="space-y-1 text-sm text-emerald-400">
														{#each rosterPreview.added as rider (rider.id)}
															<li>+ {rider.name}</li>
														{/each}
													</ul>
												</div>
											{/if}
										</div>
										<p class="meta-text">{rosterPreview.unchangedCount} renners ongewijzigd.</p>
									{/if}
								{/if}

								{#if decision.reasoning}
									<div>
										<p class="label-caps mb-1">Redenering per renner</p>
										<ul class="space-y-1.5 text-sm text-zinc-400">
											{#each reasoningLines(decision.reasoning) as line, index (index)}
												<li class="whitespace-pre-wrap">{line}</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						</details>
					{:else}
						<div class="px-3 py-2.5">
							<div class="flex flex-wrap items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="text-sm font-medium text-zinc-100">
										{decision.matchName ?? decisionTypeLabel(decision.decisionType)}
									</p>
									<p class="mt-0.5 meta-text">
										{decisionTypeLabel(decision.decisionType)} · {formatWhen(decision.submittedAt)}
									</p>
								</div>
								<div class="flex shrink-0 flex-wrap items-center gap-1.5">
									{#if decision.submitted}
										<span class="badge-ok">ingediend</span>
									{:else}
										<span class="badge-warn">simulatie</span>
									{/if}
									<span class="chip bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700">
										{confidenceDisplayLabel(decision.confidence)}
									</span>
								</div>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
