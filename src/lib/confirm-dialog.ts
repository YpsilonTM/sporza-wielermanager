export interface ConfirmDialogOptions {
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
}

export interface ConfirmDialogState extends ConfirmDialogOptions {
	open: boolean;
	busy: boolean;
	resolve: ((confirmed: boolean) => void) | null;
}

export function createConfirmDialogState(): ConfirmDialogState {
	return {
		open: false,
		busy: false,
		title: '',
		description: '',
		confirmLabel: 'Bevestigen',
		cancelLabel: 'Annuleren',
		resolve: null
	};
}

export function askConfirm(
	state: ConfirmDialogState,
	options: ConfirmDialogOptions
): Promise<boolean> {
	return new Promise((resolve) => {
		state.open = true;
		state.busy = false;
		state.title = options.title;
		state.description = options.description ?? '';
		state.confirmLabel = options.confirmLabel ?? 'Bevestigen';
		state.cancelLabel = options.cancelLabel ?? 'Annuleren';
		state.resolve = resolve;
	});
}

export function closeConfirm(state: ConfirmDialogState, confirmed: boolean): void {
	state.resolve?.(confirmed);
	state.resolve = null;
	state.open = false;
	state.busy = false;
}
