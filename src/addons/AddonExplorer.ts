import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as rimraf from 'rimraf';

import { AddonReader } from './AddonReader';
import { File } from 'buffer';

const NO_SELECTED_ADDONS_ERROR = 'Not selected addons for work';

namespace _ {

	function handleResult<T>(resolve: (result: T) => void, reject: (error: Error) => void, error: Error | null | undefined, result: T): void {
		if (error) {
			reject(massageError(error));
		} else {
			resolve(result);
		}
	}

	function massageError(error: Error & { code?: string }): Error {
		if (error.code === 'ENOENT') {
			return vscode.FileSystemError.FileNotFound();
		}

		if (error.code === 'EISDIR') {
			return vscode.FileSystemError.FileIsADirectory();
		}

		if (error.code === 'EEXIST') {
			return vscode.FileSystemError.FileExists();
		}

		if (error.code === 'EPERM' || error.code === 'EACCES') {
			return vscode.FileSystemError.NoPermissions();
		}

		return error;
	}

	export function checkCancellation(token: vscode.CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new Error('Operation cancelled');
		}
	}

	export function normalizeNFC(items: string): string;
	export function normalizeNFC(items: string[]): string[];
	export function normalizeNFC(items: string | string[]): string | string[] {
		if (process.platform !== 'darwin') {
			return items;
		}

		if (Array.isArray(items)) {
			return items.map(item => item.normalize('NFC'));
		}

		return items.normalize('NFC');
	}

	export function readdir(path: string): Promise<string[]> {
		return new Promise<string[]>((resolve, reject) => {
			fs.readdir(path, (error, children) => handleResult(resolve, reject, error, normalizeNFC(children)));
		});
	}

	export function readdirs(pathes: string[]): Promise<Promise<string[]>[]> {
		return new Promise<Promise<string[]>[]> (() => {pathes.map(path => 
			new Promise<string[]>((resolve, reject) => {
				fs.readdir(path, (error, children) => handleResult(resolve, reject, error, normalizeNFC(children)));
			})
		);});
	}

	export function stat(path: string): Promise<fs.Stats> {
		return new Promise<fs.Stats>((resolve, reject) => {
			fs.stat(path, (error, stat) => handleResult(resolve, reject, error, stat));
		});
	}

	export function readfile(path: string): Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			fs.readFile(path, (error, buffer) => handleResult(resolve, reject, error, buffer));
		});
	}

	export function writefile(path: string, content: Buffer): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.writeFile(path, content, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function exists(path: string): Promise<boolean> {
		return new Promise<boolean>((resolve, reject) => {
			fs.exists(path, exists => handleResult(resolve, reject, null, exists));
		});
	}

	export function rmrf(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			rimraf.rimraf(path);
		});
	}

	export function mkdir(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			mkdirp.default(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function rename(oldPath: string, newPath: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.rename(oldPath, newPath, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function unlink(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.unlink(path, error => handleResult(resolve, reject, error, void 0));
		});
	}
}

interface AddonEntry {
	addon: string;
	offset: number;
	uri: vscode.Uri;
	type: vscode.FileType;
}

export async function selectAddon(addon: string, addonExplorer: AddonExplorer) {
	addonExplorer.add(addon);
}

export class AddonExplorer implements vscode.TreeDataProvider<Addon | AddonEntry>, vscode.FileSystemProvider {
	
	private _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]>;
	private _selectedAddons: string[] = [];

	private _onDidChangeTreeData: vscode.EventEmitter<Addon | undefined | void> = new vscode.EventEmitter<Addon | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Addon | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private addonReader: AddonReader) {
		this._onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	}

	get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}

	add(addon: string): void {
		
		if (this._selectedAddons.indexOf(addon) === -1) {
			this._selectedAddons.push(addon);
		}

		this.refresh();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	} 

	getTreeItem(element: Addon | AddonEntry): vscode.TreeItem {

		if (element instanceof Addon) {
			return element;
		} else {
			const treeItem = new vscode.TreeItem(element.uri, element.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
			if (element.type === vscode.FileType.File) {
				treeItem.command = { command: 'fileExplorer.openFile', title: "Open File", arguments: [element.uri], };
				treeItem.contextValue = 'file';
			}
			return treeItem;
		}
	}

	async getChildren(element?: Addon | AddonEntry): Promise<Addon[] | AddonEntry[]> {

		if (element) {

			if (element instanceof Addon) {
				const addonFolders = await this.addonReader.getAddonFolders(element.label, -1);
				const dirType = vscode.FileType.Directory;
				const result: AddonEntry[] = [];

				addonFolders.forEach(folder => {
					result.push({ uri: vscode.Uri.file(folder), type: dirType, addon: element.label, offset: 0});
				});

				return result;

			} else {
				const offset = element.offset === -1 ? 1 : element.offset + 1;
				const addonFolders = await this.addonReader.getAddonFolders(element.addon, element.offset, element.uri.path);

				if (addonFolders.length === 0) {
					const children = await this.readDirectory(element.uri);

					return children.map(([name, type]) => 
						({ 
							uri: vscode.Uri.file(path.join(element.uri.fsPath, name)), 
							type, 
							addon: element.addon, 
							offset: offset
						})
					);

				} else {
					const result: AddonEntry[] = [];
					const dirType = vscode.FileType.Directory;

					addonFolders.forEach(folder => {
						result.push(
							{ 
								uri: vscode.Uri.file(folder), 
								type: dirType, 
								addon: element.addon, 
								offset: offset
							}
						);
					});

					return result;
				}
			}

		} else if (this._selectedAddons.length > 0) {
			return this.getAddons();
		}

		return [];
	}


	watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
		const watcher = fs.watch(uri.fsPath, { recursive: options.recursive }, async (event, filename) => {
			if (filename) {
				const filepath = path.join(uri.fsPath, _.normalizeNFC(filename.toString()));

				// TODO support excludes (using minimatch library?)

				this._onDidChangeFile.fire([{
					type: event === 'change' ? vscode.FileChangeType.Changed : await _.exists(filepath) ? vscode.FileChangeType.Created : vscode.FileChangeType.Deleted,
					uri: uri.with({ path: filepath })
				} as vscode.FileChangeEvent]);
			}
		});

		return { dispose: () => watcher.close() };
	}

	stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
		return this._stat(uri.fsPath);
	}

	async _stat(path: string): Promise<vscode.FileStat> {
		return new FileStat(await _.stat(path));
	}

	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
		return this._readDirectory(uri);
	}

	async _readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const children = await _.readdir(uri.fsPath);

		const result: [string, vscode.FileType][] = [];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const stat = await this._stat(path.join(uri.fsPath, child));
			result.push([child, stat.type]);
		}

		return Promise.resolve(result);
	}

	async _readDirectories(uris: vscode.Uri[]): Promise<[string, vscode.FileType][]> {
		const result: [string, vscode.FileType][] = [];
		
		for (let i = 0; i < uris.length; i++) {
			//result.push([uris[i].fsPath, vscode.FileType.Directory]);
			const children = await _.readdir(uris[i].fsPath);
			
			for (var k = 0; k < children.length; k++) {
				const child = children[k];
				const stat = await this._stat(path.join(uris[i].fsPath, child));
				result.push([child, stat.type]);
			}
		}

		return Promise.resolve(result);
	}

	readDirectories(uris: vscode.Uri[]): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
		return this._readDirectories(uris);
	}

	createDirectory(uri: vscode.Uri): void | Thenable<void> {
		return _.mkdir(uri.fsPath);
	}

	readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
		return _.readfile(uri.fsPath);
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
		return this._writeFile(uri, content, options);
	}

	async _writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
		const exists = await _.exists(uri.fsPath);
		if (!exists) {
			if (!options.create) {
				throw vscode.FileSystemError.FileNotFound();
			}

			await _.mkdir(path.dirname(uri.fsPath));
		} else {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			}
		}

		return _.writefile(uri.fsPath, content as Buffer);
	}

	delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
		if (options.recursive) {
			return _.rmrf(uri.fsPath);
		}

		return _.unlink(uri.fsPath);
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
		return this._rename(oldUri, newUri, options);
	}

	async _rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
		const exists = await _.exists(newUri.fsPath);
		if (exists) {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			} else {
				await _.rmrf(newUri.fsPath);
			}
		}

		const parentExists = await _.exists(path.dirname(newUri.fsPath));
		if (!parentExists) {
			await _.mkdir(path.dirname(newUri.fsPath));
		}

		return _.rename(oldUri.fsPath, newUri.fsPath);
	}

	private getAddonItem(addon:string): Addon {
		const addonData = this.addonReader.getAddonData(addon);

		return new Addon(addon, addonData.addon.version, vscode.TreeItemCollapsibleState.Collapsed);
	}

	/**
	 * Given the selected addons
	 */
	private getAddons(): Addon[] {
		const addonNames = this.addonReader.getAddons().filter(
			addon => this._selectedAddons.indexOf(addon) !== -1
		);
		const addons = addonNames
			? Object.values(addonNames).map(addon => this.getAddonItem(addon))
			: [];

		return addons;
	}
}

export class Addon extends vscode.TreeItem {

	constructor(
		public readonly label: string,
		private readonly version: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command
	) {
		super(label, collapsibleState);

		this.tooltip = `${this.label}-${this.version}`;
		this.description = this.version;
	}

	iconPath = {
		light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'addon.svg'),
		dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'addon.svg')
	};

	contextValue = 'addon';
}

export class FileStat implements vscode.FileStat {

	constructor(private fsStat: fs.Stats) { }

	get type(): vscode.FileType {
		return this.fsStat.isFile() ? vscode.FileType.File : this.fsStat.isDirectory() ? vscode.FileType.Directory : this.fsStat.isSymbolicLink() ? vscode.FileType.SymbolicLink : vscode.FileType.Unknown;
	}

	get isFile(): boolean | undefined {
		return this.fsStat.isFile();
	}

	get isDirectory(): boolean | undefined {
		return this.fsStat.isDirectory();
	}

	get isSymbolicLink(): boolean | undefined {
		return this.fsStat.isSymbolicLink();
	}

	get size(): number {
		return this.fsStat.size;
	}

	get ctime(): number {
		return this.fsStat.ctime.getTime();
	}

	get mtime(): number {
		return this.fsStat.mtime.getTime();
	}
}
