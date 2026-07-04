<script lang="ts">
	let {
		open = false,
		title,
		description = '',
		confirmLabel = 'Bevestigen',
		cancelLabel = 'Annuleren',
		busy = false,
		onconfirm,
		oncancel
	}: {
		open?: boolean;
		title: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		busy?: boolean;
		onconfirm?: () => void;
		oncancel?: () => void;
	} = $props();

	function handleBackdrop(event: MouseEvent) {
		if (event.target === event.currentTarget && !busy) {
			oncancel?.();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !busy) {
			oncancel?.();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
		role="presentation"
		onclick={handleBackdrop}
	>
		<div
			class="card w-full max-w-md shadow-2xl shadow-black/50"
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
		>
			<h2 id="confirm-title" class="text-lg font-semibold text-zinc-50">{title}</h2>
			{#if description}
				<p class="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-400">{description}</p>
			{/if}
			<div class="mt-5 flex flex-wrap justify-end gap-2">
				<button class="btn-secondary" type="button" disabled={busy} onclick={oncancel}>
					{cancelLabel}
				</button>
				<button class="btn-primary" type="button" disabled={busy} onclick={onconfirm}>
					{#if busy}
						<span class="spinner" aria-hidden="true"></span>
					{/if}
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
