import { writable } from 'svelte/store';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
	id: number;
	message: string;
	variant: ToastVariant;
}

let nextId = 0;

export const toasts = writable<Toast[]>([]);

export function addToast(
	message: string,
	variant: ToastVariant = 'info',
	durationMs = 3000,
): number {
	const id = ++nextId;
	toasts.update((list) => [...list, { id, message, variant }]);
	if (durationMs > 0) {
		setTimeout(() => removeToast(id), durationMs);
	}
	return id;
}

export function removeToast(id: number) {
	toasts.update((list) => list.filter((t) => t.id !== id));
}

export const toast = {
	success: (message: string, durationMs?: number) =>
		addToast(message, 'success', durationMs),
	error: (message: string, durationMs?: number) =>
		addToast(message, 'error', durationMs ?? 5000),
	info: (message: string, durationMs?: number) =>
		addToast(message, 'info', durationMs),
};
