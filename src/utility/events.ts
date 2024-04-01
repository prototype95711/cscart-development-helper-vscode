import { Event, Disposable, EventEmitter } from 'vscode';
import { dirname, sep, relative } from 'path';

export const isMacintosh = process.platform === 'darwin';
export const isWindows = process.platform === 'win32';

export interface IDisposable {
	dispose(): void;
}

export function dispose<T extends IDisposable>(disposables: T[]): T[] {
	disposables.forEach(d => d.dispose());
	return [];
}

export function toDisposable(dispose: () => void): IDisposable {
	return { dispose };
}

export function combinedDisposable(disposables: IDisposable[]): IDisposable {
	return toDisposable(() => dispose(disposables));
}

export function filterEvent<T>(event: Event<T>, filter: (e: T) => boolean): Event<T> {
	return (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => event(e => filter(e) && listener.call(thisArgs, e), null, disposables);
}

export function anyEvent<T>(...events: Event<T>[]): Event<T> {
	return (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => {
		const result = combinedDisposable(events.map(event => event(i => listener.call(thisArgs, i))));

		disposables?.push(result);

		return result;
	};
}

export function relativePath(from: string, to: string): string {
	// There are cases in which the `from` path may contain a trailing separator at
	// the end (ex: "C:\", "\\server\folder\" (Windows) or "/" (Linux/macOS)) which
	// is by design as documented in https://github.com/nodejs/node/issues/1765. If
	// the trailing separator is missing, we add it.
	if (from.charAt(from.length - 1) !== sep) {
		from += sep;
	}

	if (isDescendant(from, to) && from.length < to.length) {
		return to.substring(from.length);
	}

	// Fallback to `path.relative`
	return relative(from, to);
}

function normalizePath(path: string): string {
	// Windows & Mac are currently being handled
	// as case insensitive file systems in VS Code.
	if (isWindows || isMacintosh) {
		return path.toLowerCase();
	}

	return path;
}

export function isDescendant(parent: string, descendant: string): boolean {
	if (parent === descendant) {
		return true;
	}

	if (parent.charAt(parent.length - 1) !== sep) {
		parent += sep;
	}

	return normalizePath(descendant).startsWith(normalizePath(parent));
}
