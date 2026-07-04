<script lang="ts">
	import { onMount } from 'svelte';
	import { dashboardDecisionsUrl, dashboardFetch } from '$lib/dashboard-api';
	import type { ManagerDecisionView } from '$lib/types/decisions';

	let { dashboardKey = null }: { dashboardKey?: string | null } = $props();

	let decisions = $state<ManagerDecisionView[]>([]);
	let loading = $state(true);
	let error = $state('');

	function decisionTypeLabel(type: string): string {
		if (type === 'lineup') return 'Lineup';
		if (type === 'roster') return 'Ploeg';
		return type;
	}

	function confidenceLabel(value: number | null): string {
		if (value == null) return '—';
		if (value >= 0.85) return 'Hoog';
		if (value >= 0.55) return 'Medium';
		return 'Laag';
	}

	function formatWhen(iso: string): string {
		return new Date(iso).toLocaleString('nl-BE', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
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
		<h3 class="text-base font-semibold text-slate-100">AI-beslissingen</h3>
		<button class="btn-ghost !py-1 text-xs" type="button" onclick={loadDecisions} disabled={loading}>
			↻
		</button>
	</div>

	{#if loading && decisions.length === 0}
		<p class="text-sm text-slate-500">Historiek laden…</p>
	{:else if error}
		<p class="text-sm text-red-400">{error}</p>
	{:else if decisions.length === 0}
		<p class="text-sm text-slate-500">Nog geen opgeslagen beslissingen.</p>
	{:else}
		<ul class="space-y-2">
			{#each decisions as decision (decision.id)}
				<li class="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5">
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div class="min-w-0">
							<p class="text-sm font-medium text-slate-100">
								{decision.matchName ?? decisionTypeLabel(decision.decisionType)}
							</p>
							<p class="mt-0.5 text-xs text-slate-500">
								{decisionTypeLabel(decision.decisionType)} · {formatWhen(decision.submittedAt)}
							</p>
						</div>
						<div class="flex shrink-0 flex-wrap items-center gap-1.5">
							{#if decision.submitted}
								<span class="badge-ok">ingediend</span>
							{:else}
								<span class="badge-warn">simulatie</span>
							{/if}
							<span class="chip bg-slate-800 text-slate-300 ring-slate-700">
								{confidenceLabel(decision.confidence)}
							</span>
						</div>
					</div>
					{#if decision.summary}
						<p class="mt-2 line-clamp-2 text-xs text-slate-400">{decision.summary}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
