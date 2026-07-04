<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import RiderAvatar from '$lib/components/RiderAvatar.svelte';
	import { formatRoleLabel } from '$lib/format';
	import type { TransferStateView } from '$lib/types/overview';
	import type { ManagePreviewView, RosterPreviewView } from '$lib/types/preview';

	let {
		summary = '',
		reasoning = '',
		submitted = false,
		managePreview = null,
		rosterPreview = null,
		canSubmit = false,
		submitBusy = false,
		hasPendingTransfer = false,
		includeTransfer = $bindable(true),
		transferState = null,
		onsubmit
	}: {
		summary?: string;
		reasoning?: string;
		submitted?: boolean;
		managePreview?: ManagePreviewView | null;
		rosterPreview?: RosterPreviewView | null;
		canSubmit?: boolean;
		submitBusy?: boolean;
		hasPendingTransfer?: boolean;
		includeTransfer?: boolean;
		transferState?: TransferStateView | null;
		onsubmit?: () => void;
	} = $props();

	function changeClass(change: string): string {
		if (change === 'removed') return 'text-red-300';
		if (change === 'added' || change === 'starter') return 'text-emerald-400';
		if (change === 'bench') return 'text-amber-300';
		return 'text-sky-300';
	}

	function changeLabel(change: string): string {
		if (change === 'removed') return 'eruit';
		if (change === 'added') return 'nieuw';
		if (change === 'starter') return 'starter';
		if (change === 'bench') return 'bank';
		return 'wijziging';
	}
</script>

<details class="card group" open>
	<summary class="cursor-pointer list-none">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<p class="label-caps text-zinc-400">
					{submitted ? 'AI-resultaat' : 'Simulatie'}
					{#if !submitted}
						<span class="ml-2 normal-case text-amber-300">(niet ingediend)</span>
					{/if}
				</p>
				{#if summary}
					<p class="mt-1 line-clamp-2 text-sm text-zinc-400">{summary}</p>
				{/if}
			</div>
			<ChevronDown class="size-4 shrink-0 text-zinc-500 transition group-open:rotate-180" />
		</div>
	</summary>

	<div class="mt-3 space-y-4 border-t border-zinc-800/80 pt-3">
		{#if managePreview?.transfer}
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
					Kost: {managePreview.transfer.cost <= 0 ? 'gratis' : `€${managePreview.transfer.cost}M`}
					{#if managePreview.transfer.executed}
						· <span class="text-emerald-400">uitgevoerd</span>
					{:else}
						· <span class="text-amber-300">niet uitgevoerd</span>
					{/if}
				</p>
				{#if managePreview.transfer.reasoning}
					<p class="mt-1 meta-text">{managePreview.transfer.reasoning}</p>
				{/if}
			</div>
		{/if}

		{#if managePreview && managePreview.changes.length > 0}
			<div>
				<p class="label-caps mb-2">
					Lineup wijzigingen ({managePreview.changes.length})
				</p>
				<ul class="space-y-1.5">
					{#each managePreview.changes as change (change.id)}
						<li class="surface-nested flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
							<span class="font-medium text-zinc-100">{change.name}</span>
							<span class="meta-text">
								{change.from ?? '—'} → {change.to ?? '—'}
							</span>
							<span class="chip text-[0.65rem] {changeClass(change.change)} bg-zinc-900 ring-1 ring-zinc-700">
								{changeLabel(change.change)}
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if managePreview}
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<p class="label-caps mb-2">Huidig</p>
					{#if managePreview.currentLineup}
						<ul class="space-y-1 text-xs text-zinc-400">
							{#each managePreview.currentLineup.starters as rider (rider.id)}
								<li>{rider.name} · {formatRoleLabel(rider.role)}</li>
							{/each}
							{#each managePreview.currentLineup.bench as rider (rider.id)}
								<li class="text-zinc-500">{rider.name} · {formatRoleLabel(rider.role)}</li>
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
							<li class="text-zinc-400">{rider.name} · {formatRoleLabel(rider.role)}</li>
						{/each}
					</ul>
				</div>
			</div>
		{/if}

		{#if rosterPreview && (rosterPreview.added.length > 0 || rosterPreview.removed.length > 0)}
			<div class="grid gap-3 sm:grid-cols-2">
				{#if rosterPreview.removed.length > 0}
					<div>
						<p class="label-caps mb-2 text-red-400">Eruit</p>
						<ul class="space-y-1.5">
							{#each rosterPreview.removed as rider (rider.id)}
								<li class="flex items-center gap-2 text-sm text-red-300">
									<RiderAvatar jerseyUrl={rider.jerseyUrl} name={rider.name} size="sm" />
									<span>{rider.name}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
				{#if rosterPreview.added.length > 0}
					<div>
						<p class="label-caps mb-2 text-emerald-400">Erin</p>
						<ul class="space-y-1.5">
							{#each rosterPreview.added as rider (rider.id)}
								<li class="flex items-center gap-2 text-sm text-emerald-400">
									<RiderAvatar jerseyUrl={rider.jerseyUrl} name={rider.name} size="sm" />
									<span>{rider.name}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
			<p class="meta-text">{rosterPreview.unchangedCount} renners ongewijzigd.</p>
		{/if}

		{#if reasoning}
			<p class="text-sm text-zinc-400">
				<span class="font-semibold text-zinc-300">Reden:</span>
				{reasoning}
			</p>
		{/if}

		{#if canSubmit && !submitted}
			<div class="space-y-3 border-t border-zinc-800/80 pt-3">
				{#if hasPendingTransfer}
					<div class="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3">
						<label class="flex cursor-pointer items-start gap-2 text-sm text-zinc-200">
							<input class="mt-0.5 accent-zinc-400" type="checkbox" bind:checked={includeTransfer} />
							<span>
								Transfer uitvoeren bij indienen
								<span class="mt-1 block meta-text">
									AI stelt een wissel voor — vink uit als je enkel de lineup wilt indienen.
									{#if transferState}
										<span class="mt-0.5 block">
											{transferState.freeTransfersRemaining} gratis resterend · €{transferState.remainingBudget}M
											budget
										</span>
									{/if}
								</span>
							</span>
						</label>
						{#if !includeTransfer}
							<p class="mt-2 text-xs text-amber-300/90">
								Zonder transfer wordt alleen de lineup ingediend. Die is berekend voor de nieuwe ploeg —
								indienen kan mislukken als het voorstel renners bevat die nog niet in je ploeg zitten.
							</p>
						{/if}
					</div>
				{/if}
				<button
					class="btn-primary w-full !py-3"
					type="button"
					disabled={submitBusy}
					onclick={onsubmit}
				>
					{#if submitBusy}
						<span class="spinner" aria-hidden="true"></span>
						Indienen bij Sporza…
					{:else if hasPendingTransfer && includeTransfer}
						Lineup + transfer indienen
					{:else}
						Voorstel indienen bij Sporza
					{/if}
				</button>
			</div>
		{/if}
	</div>
</details>
