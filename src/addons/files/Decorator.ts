import * as vscode from 'vscode';
import * as path from 'path';
import { AddonEntry } from '../AddonExplorer';

export class AddonFileDecorationProvider implements vscode.FileDecorationProvider {

	private static CuttedFileDecorationData: vscode.FileDecoration = {
		tooltip: 'Cutted in CS-Cart Addon Explorer',
		badge: 'C',
		color: new vscode.ThemeColor('csAddonExplorer.cuttedFilesForeground')
	};

	private readonly _onDidChangeDecorations = new vscode.EventEmitter<vscode.Uri[]>();
	readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri[]> = this._onDidChangeDecorations.event;

	private disposables: vscode.Disposable[] = [];
	private decorations = new Map<string, vscode.FileDecoration>();

	constructor() {
		this.disposables.push(
			vscode.window.registerFileDecorationProvider(this)
		);
	}

	public onCutFiles(cuttedFiles: AddonEntry[]): void {
		const newDecorations = new Map<string, vscode.FileDecoration>();

		this.collectCuttedDecorationData(newDecorations, cuttedFiles);

		const uris = new Set([...this.decorations.keys()].concat([...newDecorations.keys()]));
		this.decorations = newDecorations;
		this._onDidChangeDecorations.fire([...uris.values()].map(value => vscode.Uri.parse(value, true)));
	}
	
	private collectCuttedDecorationData(bucket: Map<string, vscode.FileDecoration>, cutted: AddonEntry[]): void {
		for (const cutted_file of cutted) {
			bucket.set(
                vscode.Uri.file(
                    cutted_file.uri.path
                ).toString(), 
                AddonFileDecorationProvider.CuttedFileDecorationData
            );
		}
	}

	provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
		return this.decorations.get(uri.toString());
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

export class Resource implements vscode.SourceControlResourceState {

	static getStatusLetter(cutted: boolean): string {
		switch (cutted) {
			case true:
				return 'C';
			default:
				throw new Error('Unexpected cutted status!');
		}
	}

	static getCuttedText(cutted: boolean) {
		switch (cutted) {
			case true: return vscode.l10n.t('Cutted in CS-Cart Addon Explorer');
			default: return '';
		}
	}

	static getCuttedColor(cutted: boolean): vscode.ThemeColor {
        switch (cutted) {
			case true: return new vscode.ThemeColor('csAddonExplorer.cuttedFilesForeground');
			case false:
			default: throw new Error('Unexpected cutted status!');
		}
	}

	@memoize
	get resourceUri(): vscode.Uri {
		return this._resourceUri;
	}

	get cutted(): boolean { return this._cutted; }
	get original(): vscode.Uri { return this._resourceUri; }
	get renameResourceUri(): vscode.Uri | undefined { return this._renameResourceUri; }

	private getIconPath(theme: string): vscode.Uri {
		switch (this.cutted) {
			case true: return getIconUri('status-copied', 'dark');
			default: throw new Error('Unexpected cutted status!');
		}
	}

	private get tooltip(): string {
		return Resource.getCuttedText(this.cutted);
	}

	private get strikeThrough(): boolean {
		return this.cutted;
	}

	@memoize
	private get faded(): boolean {
		// TODO@joao
		return false;
		// const workspaceRootPath = this.workspaceRoot.fsPath;
		// return this.resourceUri.fsPath.substr(0, workspaceRootPath.length) !== workspaceRootPath;
	}

	get decorations(): vscode.SourceControlResourceDecorations {
		const light = this._useIcons ? { iconPath: this.getIconPath('light') } : undefined;
		const dark = this._useIcons ? { iconPath: this.getIconPath('dark') } : undefined;
		const tooltip = this.tooltip;
		const strikeThrough = this.strikeThrough;
		const faded = this.faded;
		return { strikeThrough, faded, tooltip, light, dark };
	}

	get letter(): string {
		return Resource.getStatusLetter(this.cutted);
	}

	get color(): vscode.ThemeColor {
		return Resource.getCuttedColor(this.cutted);
	}

	get priority(): number {
		switch (this._cutted) {
			case true:
				return 2;
			default:
				return 1;
		}
	}

	get resourceDecoration(): vscode.FileDecoration {
		const res = new vscode.FileDecoration(this.letter, this.tooltip, this.color);
		res.propagate = false;
		return res;
	}

	constructor(
		private _resourceUri: vscode.Uri,
		private _cutted: boolean,
		private _useIcons: boolean,
		private _renameResourceUri?: vscode.Uri,
	) { }
}

export interface csAddonExplorerGroup extends vscode.SourceControlResourceGroup {
	resourceStates: Resource[];
}

function decorate(decorator: (fn: Function, key: string) => Function): Function {
	return (_target: any, key: string, descriptor: any) => {
		let fnKey: string | null = null;
		let fn: Function | null = null;

		if (typeof descriptor.value === 'function') {
			fnKey = 'value';
			fn = descriptor.value;
		} else if (typeof descriptor.get === 'function') {
			fnKey = 'get';
			fn = descriptor.get;
		}

		if (!fn || !fnKey) {
			throw new Error('not supported');
		}

		descriptor[fnKey] = decorator(fn, key);
	};
}

function _memoize(fn: Function, key: string): Function {
	const memoizeKey = `$memoize$${key}`;

	return function (this: any, ...args: any[]) {
		if (!this.hasOwnProperty(memoizeKey)) {
			Object.defineProperty(this, memoizeKey, {
				configurable: false,
				enumerable: false,
				writable: false,
				value: fn.apply(this, args)
			});
		}

		return this[memoizeKey];
	};
}

const iconsRootPath = path.join(path.dirname(__dirname), 'resources', 'icons');

function getIconUri(iconName: string, theme: string): vscode.Uri {
	return vscode.Uri.file(path.join(iconsRootPath, theme, `${iconName}.svg`));
}

export const memoize = decorate(_memoize);
