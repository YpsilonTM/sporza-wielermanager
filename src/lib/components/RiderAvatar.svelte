<script lang="ts">
	let {
		jerseyUrl = undefined,
		name,
		size = 'md'
	}: {
		jerseyUrl?: string;
		name: string;
		size?: 'sm' | 'md';
	} = $props();

	const sizeClass = $derived(size === 'sm' ? 'size-7' : 'size-9');
	const initial = $derived(name.trim().charAt(0).toUpperCase() || '?');
</script>

{#if jerseyUrl}
	<img
		src={jerseyUrl}
		alt=""
		class="{sizeClass} shrink-0 rounded-md bg-white/90 object-contain p-0.5 ring-1 ring-zinc-700/50"
		loading="lazy"
	/>
{:else}
	<span
		class="{sizeClass} flex shrink-0 items-center justify-center rounded-md bg-zinc-800 text-xs font-bold text-zinc-400 ring-1 ring-zinc-700/50"
		aria-hidden="true"
	>
		{initial}
	</span>
{/if}
