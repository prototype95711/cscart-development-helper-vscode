import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as rimraf from 'rimraf';

import { AddonReader } from './AddonReader';
import { File } from 'buffer';
import { ClipboardService } from '../utility/clipboardService';
import { IClipboardService } from '../utility/IClipboardService';
import { isEqual, isEqualOrParent, rtrim } from '../utility/strings';
import { posix, win32 } from 'path/posix';
import { ResourceFileEdit } from '../utility/resourceFileEdit';
import { IProgressCompositeOptions, IProgressNotificationOptions } from '../utility/progress';

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

export class AddonExplorer implements vscode.TreeDataProvider<Addon | AddonEntry>,  vscode.TreeDragAndDropController<AddonEntry>, vscode.FileSystemProvider {

	private _hasFilesToPaste: ContextKey;

	dropMimeTypes = ['application/vnd.code.tree.csAddonExplorer'];
	dragMimeTypes = ['text/uri-list'];
	
	tree: AddonEntry[] = [];

	private pasteShouldMove = false;
	private selected: AddonEntry[] = [];
	private cutItems: AddonEntry[] | undefined;

	private clipboardService: IClipboardService;
	private _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]>;
	private _selectedAddons: string[] = [];

	private _onDidChangeTreeData: vscode.EventEmitter<Addon | AddonEntry | undefined | void> = new vscode.EventEmitter<Addon | AddonEntry | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Addon | AddonEntry | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private addonReader: AddonReader) {
		this._hasFilesToPaste = new ContextKey('addonExplorer.hasFilesToPaste');

		this._onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
		this.clipboardService = new ClipboardService();
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
			const treeItem = new vscode.TreeItem(
				element.uri, 
				element.type === vscode.FileType.Directory 
					? vscode.TreeItemCollapsibleState.Collapsed 
					: vscode.TreeItemCollapsibleState.None
			);
			
			if (element.type === vscode.FileType.File) {
				treeItem.command = { command: 'csAddonExplorer.openFile', title: "Open File", arguments: [element.uri] };
				treeItem.contextValue = 'file';
			} else if (element.type === vscode.FileType.Directory) {
				treeItem.contextValue = 'folder';
			}

			return treeItem;
		}
	}

	public getParent(element: AddonEntry): AddonEntry {
		return this._getParent(element);
	}

	async getChildren(element?: Addon | AddonEntry): Promise<Addon[] | AddonEntry[]> {

		if (element) {

			if (element instanceof Addon) {
				const addonFolders = await this.addonReader.getAddonPathes(element.label, -1);
				const result: AddonEntry[] = [];

				addonFolders.forEach(_path => {
					const entry: AddonEntry = { uri: vscode.Uri.file(_path.path), type: _path.type, addon: element.label, offset: 0};
					result.push(entry);
					this.tree.push(entry);
				});

				return result;

			} else {
				const offset = element.offset === -1 ? 1 : element.offset + 1;
				const addonPathes = await this.addonReader.getAddonPathes(element.addon, element.offset, element.uri.path);

				if (addonPathes.length === 0) {
					const children = await this.readDirectory(element.uri);

					children.sort((a, b) => {
						if (a[1] === b[1]) {
							return a[0].localeCompare(b[0]);
						}
						return a[1] === vscode.FileType.Directory ? -1 : 1;
					});

					const result: AddonEntry[] = [];

					children.forEach(([name, type]) => {
						const entry: AddonEntry = { 
							uri: vscode.Uri.file(path.join(element.uri.fsPath, name)), 
							type, 
							addon: element.addon, 
							offset: offset
						};

						result.push(entry);
						this.tree.push(entry);
					});

					return result;

				} else {
					const result: AddonEntry[] = [];

					addonPathes.forEach(_path => {
						const entry: AddonEntry = { 
							uri: vscode.Uri.file(_path.path), 
							type: _path.type, 
							addon: element.addon, 
							offset: offset
						};

						result.push(entry);
						this.tree.push(entry);
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

	// Drag and drop controller

	public async handleDrop(target: Addon | AddonEntry | undefined, sources: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
		const transferItem = sources.get('application/vnd.code.tree.csAddonExplorer');

		if (!transferItem) {
			return;
		}

		const treeItems: AddonEntry[] = transferItem.value;
		let roots = this._getLocalRoots(treeItems);
		// Remove nodes that are already target's parent nodes
		roots = roots.filter(r => !this._isChild(this._getTreeElement(r.uri.path), target));
		if (roots.length > 0) {
			// Reload parents of the moving elements
			const parents = roots.map(r => this.getParent(r));

			if (target && target !== undefined && !(target instanceof Addon)) {
				roots.forEach(
					r => 
					{
						var filename = r.uri.path.split('/').pop();

						if (filename !== undefined) {
							vscode.Uri.file(path.join(target.uri.fsPath, filename));
						}
					}
				);
			}
			
			roots.forEach(r => this._reparentNode(r, target));
			this._onDidChangeTreeData.fire(...parents, target);

			this.refresh();
		}
	}

	public async handleDrag(source: AddonEntry[], treeDataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
		treeDataTransfer.set('application/vnd.code.tree.csAddonExplorer', new vscode.DataTransferItem(source));
	}

	// Helper methods

	_isChild(node: AddonEntry | Addon, child: AddonEntry | Addon | undefined): boolean {
		if (!child) {
			return false;
		}

		const addon = child instanceof Addon ? child.label : child.addon;

		if (node instanceof Addon) {
			return node.label === addon;
		}

		if (!(child instanceof Addon) && child.uri.path.includes(node.uri.path, 0)) {
			return true;
		}

		return false;
	}

	// From the given nodes, filter out all nodes who's parent is already in the the array of Nodes.
	_getLocalRoots(nodes: AddonEntry[]): AddonEntry[] {
		const localRoots = [];
		for (let i = 0; i < nodes.length; i++) {
			const parent = this.getParent(nodes[i]);
			if (parent) {
				const isInList = nodes.find(n => n.uri.path === parent.uri.path);
				if (isInList === undefined) {
					localRoots.push(nodes[i]);
				}
			} else {
				localRoots.push(nodes[i]);
			}
		}
		return localRoots;
	}

	_getParent(element: AddonEntry | vscode.Uri): any {

		var result: AddonEntry = element instanceof vscode.Uri
			? this._getTreeElement(element.path)
			: element;

		var elementUri = element instanceof vscode.Uri
			? element
			: element.uri;
		
		this.tree.forEach(el => {
			if (
				elementUri.path !== el.uri.path
				&& elementUri.path.includes(el.uri.path)
				&& (result === element || result.uri.path.length < el.uri.path.length)
			) {
				result = el;
			}
		});

		return result;
	}

	_getTreeElement(path: string | undefined): any {
		if (!path) {
			return null;
		}

		var result = undefined;
		
		this.tree.forEach(el => {
			if (
				el.uri.path === path
			) {
				result = el;
			}
		});

		return result;
	}

	_reparentNode(node: AddonEntry, target: Addon | AddonEntry | undefined): void {
		if (target instanceof Addon) {
			return;
		}
		
		const element: any = {};
		element[node.uri.path] = this._getTreeElement(node.uri.path);
		const elementCopy = { ...element };
		this._removeNode(node);
		const targetElement = this._getTreeElement(target?.uri.path);
		var target_uri = target?.uri;
		
		if (Object.keys(element).length === 0) {
			targetElement[node.uri.path] = {};
		} else {
			if (target_uri) {

				if (target !== undefined && !(target instanceof Addon)) {

					var filename = node.uri.path.split('/').pop();

					if (filename !== undefined) {
						target_uri = vscode.Uri.file(path.join(target_uri.fsPath, filename));
					}
				}

				this.rename(node.uri, target_uri, {overwrite: true});
			}
		}
	}

	_removeNode(element: AddonEntry): void {

		this.tree.forEach((el, key) => {
			if (
				el.addon === element.addon 
				&& el.uri.path.includes(element.uri.path)
			) {
				delete this.tree[key];
			}
		});
	}

	selectItems(selection: vscode.TreeViewSelectionChangeEvent<AddonEntry | Addon>) {
		
		this.selected = [];

		if (selection?.selection.length > 0) {
			selection.selection.forEach(element => {
				if (element instanceof Addon) {

				} else {
					this.selected.push(element);
				}
			});
		}
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

	public async openFile(resource: vscode.Uri) {
		const activeTextEditor = vscode.window.activeTextEditor;
		const previousVisibleRange = activeTextEditor?.visibleRanges[0];
		const previousURI = activeTextEditor?.document.uri;
		const previousSelection = activeTextEditor?.selection;

		const opts: vscode.TextDocumentShowOptions = {
			preserveFocus: false,
			preview: false,
			viewColumn: vscode.ViewColumn.Active
		};

		await vscode.commands.executeCommand('vscode.open', resource, {
			...opts,
			override: undefined
		});

		const document = vscode.window.activeTextEditor?.document;

		if (
			document?.uri.toString() !== resource.toString() 
			|| !activeTextEditor 
			|| !previousURI 
			|| !previousSelection
		) {
			return;
		}

		if (previousURI.path === resource.path && document) {
			opts.selection = previousSelection;
			const editor = await vscode.window.showTextDocument(document, opts);

			if (previousVisibleRange) {
				editor.revealRange(previousVisibleRange);
			}
		}
	}

	public async openWith(resource: AddonEntry | vscode.Uri) {

		if (!resource) {
			return;
		}

		if (resource instanceof vscode.Uri) {
			await vscode.commands.executeCommand('explorer.openWith', resource);
		} else {
			await vscode.commands.executeCommand('explorer.openWith', resource.uri);
		}
	}

	public async openFileToSide(resource: AddonEntry | vscode.Uri) {

		if (!resource) {
			return;
		}

		if (resource instanceof vscode.Uri) {
			await vscode.commands.executeCommand('explorer.openToSide', resource);
		} else {
			await vscode.commands.executeCommand('explorer.openToSide', resource.uri);
		}
	}

	public async revealFileInExplorer(resource: AddonEntry | vscode.Uri) {

		if (!resource) { 
			return;
		}

		if (resource instanceof vscode.Uri) {
			await vscode.commands.executeCommand('revealInExplorer', resource);
		} else {
			await vscode.commands.executeCommand('revealInExplorer', resource.uri);
		}
	}

	public async revealFileInOS(resource: AddonEntry | vscode.Uri) {

		if (!resource) {
			return;
		}

		if (resource instanceof vscode.Uri) {
			await vscode.commands.executeCommand('revealFileInOS', resource);
		} else {
			await vscode.commands.executeCommand('revealFileInOS', resource.uri);
		}
	}

	public async cut(target: AddonEntry | vscode.Uri) {
		
		var toCut: AddonEntry[] = [];
		var _selected = this.selected;
		
		if (target && _selected.length <= 1) {	
			var itemTarget: AddonEntry;

			if (target instanceof vscode.Uri) {
				itemTarget = this._getTreeElement(target.path);
			} else {
				itemTarget = target;
			}

			if (itemTarget && toCut.indexOf(itemTarget) === -1) {
				toCut.push(itemTarget);
			}

			if (_selected.length === 1) {
				_selected.filter(element => {
					if (element.uri.path === itemTarget.uri.path 
						|| isEqualOrParent(element.uri.path, itemTarget.uri.path)
					) {
						return false;
					}

					return true;
				});
			}

		} else if (_selected.length > 0) {
			toCut = _selected;
		}

		this.setToCopy(toCut, true);
		this.pasteShouldMove = true;

		/*if (resource instanceof vscode.Uri) {
			await vscode.commands.executeCommand('filesExplorer.cut', resource);
		} else {
			await vscode.commands.executeCommand('filesExplorer.cut', resource.uri);
		}*/
	}

	public async copy(target: AddonEntry | vscode.Uri) {
		
		var toCopy: AddonEntry[] = [];
		var _selected = this.selected;
		
		if (target && _selected.length <= 1) {	
			var itemTarget: AddonEntry;

			if (target instanceof vscode.Uri) {
				itemTarget = this._getTreeElement(target.path);
			} else {
				itemTarget = target;
			}

			if (itemTarget && toCopy.indexOf(itemTarget) === -1) {
				toCopy.push(itemTarget);
			}

			if (_selected.length === 1) {
				_selected.filter(element => {
					if (element.uri.path === itemTarget.uri.path 
						|| isEqualOrParent(element.uri.path, itemTarget.uri.path)
					) {
						return false;
					}

					return true;
				});
			}

		} else if (_selected.length > 0) {
			toCopy = _selected;
		}

		this.setToCopy(toCopy, false);
		this.pasteShouldMove = false;

		/*if (target instanceof vscode.Uri) {
			await vscode.commands.executeCommand('filesExplorer.copy');
		} else {
			await vscode.commands.executeCommand('filesExplorer.copy');
		}*/
	}

	async setToCopy(items: AddonEntry[], cut: boolean): Promise<void> {
		this.cutItems = cut ? items : undefined;
		await this.clipboardService.writeResources(items.map(s => s.uri));

		this._hasFilesToPaste.set(items.length > 0);

		//this.view?.itemsCopied(items, cut, previouslyCutItems);
	}

	async getFilesToPaste(): Promise<readonly vscode.Uri[]> {
		return this.distinctParents(await this.clipboardService.readResources(), resource => resource);
	}

	private distinctParents<T>(items: T[], resourceAccessor: (item: T) => vscode.Uri): T[] {
		const distinctParents: T[] = [];
		for (let i = 0; i < items.length; i++) {
			const candidateResource = resourceAccessor(items[i]);
			if (items.some((otherItem, index) => {
				if (index === i) {
					return false;
				}
	
				return isEqualOrParent(candidateResource.toString(), resourceAccessor(otherItem).toString());
			})) {
				continue;
			}
	
			distinctParents.push(items[i]);
		}
	
		return distinctParents;
	}

	public coalesce<T>(array: ReadonlyArray<T | undefined | null>): T[] {
		return <T[]>array.filter(e => !!e);
	}

	public async paste(element: AddonEntry | vscode.Uri) {

		const incrementalNaming = "disabled";

		const toPaste = await this.getFilesToPaste();
		const elementUri = element instanceof vscode.Uri ? element : element.uri;

		try {
			// Check if target is ancestor of pasted folder
			
			const sourceTargetPairs = this.coalesce(await Promise.all(toPaste.map(async fileToPaste => {
	
				if (
					elementUri.path !== fileToPaste.path
					&& isEqualOrParent(elementUri.path, fileToPaste.path)
				) {
					throw new Error("File to paste is an ancestor of the destination folder");
				}
				const fileToPasteStat = await _.stat(fileToPaste.path);
	
				// Find target
				var target: AddonEntry;

				const elementObj = element instanceof vscode.Uri ?
					this._getTreeElement(element.path)
					: element;

				if (elementUri === fileToPaste) {
					target = this._getParent(elementUri);
				} else {
					target = elementObj?.type === vscode.FileType.Directory 
						? elementObj
						: this._getParent(elementUri);
				}
	
				const targetFile = await this.findValidPasteFileTarget(
					target,
					{ 
						resource: fileToPaste, 
						isDirectory: fileToPasteStat.isDirectory(), 
						allowOverwrite: this.pasteShouldMove || incrementalNaming === 'disabled' 
					},
					incrementalNaming
				);
	
				if (!targetFile) {
					return undefined;
				}
	
				return { source: fileToPaste, target: targetFile, target_element: target};
			})));
	
			if (sourceTargetPairs.length >= 1) {
				// Move/Copy File
				if (this.pasteShouldMove) {
					sourceTargetPairs.map(s => this.moveFileByAction(s));
					
					/*const resourceFileEdits = sourceTargetPairs.map(pair => new ResourceFileEdit(
						pair.source, 
						pair.target, 
						{ overwrite: incrementalNaming === 'disabled' }
						)
					);
					
					const options = {
						confirmBeforeUndo: true, //verbose mode
						progressLabel: sourceTargetPairs.length > 1 ? vscode.l10n.t("Moving {0} files", sourceTargetPairs.length)
							: vscode.l10n.t("Moving {0}", path.basename(sourceTargetPairs[0].target.path) || sourceTargetPairs[0].target.authority),
						undoLabel: sourceTargetPairs.length > 1 ? vscode.l10n.t("Move {0} files", sourceTargetPairs.length)
							: vscode.l10n.t("Move {0}", path.basename(sourceTargetPairs[0].target.path) || sourceTargetPairs[0].target.authority)
					};
					await this.applyBulkEdit(resourceFileEdits, options);*/
				} else {
					sourceTargetPairs.map(s => this.duplicateFileByAction(s));
					/*const resourceFileEdits = sourceTargetPairs.map(pair => new ResourceFileEdit(pair.source, pair.target, { copy: true, overwrite: incrementalNaming === 'disabled' }));
					const undoLevel = configurationService.getValue<IFilesConfiguration>().explorer.confirmUndo;
					const options = {
						confirmBeforeUndo: undoLevel === UndoConfirmLevel.Default || undoLevel === UndoConfirmLevel.Verbose,
						progressLabel: sourceTargetPairs.length > 1 ? nls.localize({ key: 'copyingBulkEdit', comment: ['Placeholder will be replaced by the number of files being copied'] }, "Copying {0} files", sourceTargetPairs.length)
							: nls.localize({ key: 'copyingFileBulkEdit', comment: ['Placeholder will be replaced by the name of the file copied.'] }, "Copying {0}", resources.basenameOrAuthority(sourceTargetPairs[0].target)),
						undoLabel: sourceTargetPairs.length > 1 ? nls.localize({ key: 'copyBulkEdit', comment: ['Placeholder will be replaced by the number of files being copied'] }, "Paste {0} files", sourceTargetPairs.length)
							: nls.localize({ key: 'copyFileBulkEdit', comment: ['Placeholder will be replaced by the name of the file copied.'] }, "Paste {0}", resources.basenameOrAuthority(sourceTargetPairs[0].target))
					};
					await explorerService.applyBulkEdit(resourceFileEdits, options);*/
				}
	
				const pair = sourceTargetPairs[0];
				//const target_el = this._getTreeElement(pair.target.path);

				//await this.selectItems([target_el]);

				if (sourceTargetPairs.length === 1) {
					const item = await this.findClosest(pair.target);

					if (item && item.type !== vscode.FileType.Directory) {
						//await editorService.openEditor({ resource: item.resource, options: { pinned: true, preserveFocus: true } });
					}
				}
			}
		} catch (e) {
			console.log(e);
			//onError(notificationService, new Error(nls.localize('fileDeleted', "The file(s) to paste have been deleted or moved since you copied them. {0}", getErrorMessage(e))));
		} finally {
			this.refresh();
			this.cutItems = [];
			this.clipboardService.writeResources([]);
			this._hasFilesToPaste.set((await this.clipboardService.readResources()).length > 0);
			/*if (pasteShouldMove) {
				// Cut is done. Make sure to clear cut state.
				await explorerService.setToCopy([], false);
				pasteShouldMove = false;
			}*/
		}
	}

	async moveFileByAction(action: any) {
		var items = [];
		var item = this._getTreeElement(action.source.path);

		if (!item) {
			return;
		} else if (item.type === vscode.FileType.Directory) {
			items.push(item);
			items.concat(await this.getChildren(item));
		} else {
			items.push(item);
		}

		let roots = this._getLocalRoots(items);

		// Remove nodes that are already target's parent nodes
		roots = roots.filter(
			r => !this._isChild(
				this._getTreeElement(r.uri.path), 
				this._getTreeElement(action.target.path)
			)
		);

		if (roots.length > 0) {
			// Reload parents of the moving elements
			const parents = roots.map(r => this.getParent(r));
			const latestPartOfTarget = action.target.path.split('/').pop();

			if (action.target && action.target !== undefined && (action.target instanceof vscode.Uri)) {
				roots.forEach(
					r => 
					{
						var filename = r.uri.path.split('/').pop();

						if (filename !== undefined) {
							var target_uri = latestPartOfTarget === filename
								? vscode.Uri.file(action.target.fsPath)
								: vscode.Uri.file(path.join(action.target.fsPath, filename));

							const target = action.target_element;

							this._reparentNode(r, target);
							this._onDidChangeTreeData.fire(...parents, target_uri);
						}
					}
				);
			}
		}
	}

	async duplicateFileByAction(action: any) {
		let items = [];
		let item = this._getTreeElement(action.source.path);

		if (!item) {
			return;
		} else if (item.type === vscode.FileType.Directory) {
			items = await this.getChildren(item);
		} else {
			items.push(item);
		}

		let roots = this._getLocalRoots(items);

		// Remove nodes that are already target's parent nodes
		roots = roots.filter(
			r => !this._isChild(
				this._getTreeElement(r.uri.path), 
				this._getTreeElement(action.target.path)
			)
		);

		if (roots.length > 0) {
			// Reload parents of the moving elements
			const parents = roots.map(r => this.getParent(r));
			const latestPartOfTarget = action.target.path.split('/').pop();

			if (action.target && action.target !== undefined && (action.target instanceof vscode.Uri)) {
				roots.forEach(
					r => 
					{
						var filename = r.uri.path.split('/').pop();

						if (filename !== undefined) {
							var target_uri = latestPartOfTarget === filename
								? vscode.Uri.file(action.target.fsPath)
								: vscode.Uri.file(path.join(action.target.fsPath, filename));
							
							this._duplicateFile(r, target_uri);
							this._onDidChangeTreeData.fire(...parents, target_uri);
						}
					}
				);
			}
		}
	}

	async _duplicateFile(element: AddonEntry, target: vscode.Uri) {
		const stat = await this._stat(element.uri.path);

		if (stat.type === vscode.FileType.Directory) {
			await _.mkdir(path.dirname(target.fsPath));
		} else {
			var buf = await this.readFile(element.uri);
			await this.writeFile(target, buf, {create:true, overwrite:true});
		}
	}

	async applyBulkEdit(edit: ResourceFileEdit[], options: { undoLabel: string; progressLabel: string; confirmBeforeUndo?: boolean; progressLocation?: vscode.ProgressLocation.Window }): Promise<void> {
		/*const cancellationTokenSource = new vscode.CancellationTokenSource();
		const promise = vscode.window.withProgress(<IProgressNotificationOptions | IProgressCompositeOptions>{
			location: options.progressLocation || vscode.ProgressLocation.Window,
			title: options.progressLabel,
			cancellable: edit.length > 1, // Only allow cancellation when there is more than one edit. Since cancelling will not actually stop the current edit that is in progress.
			delay: 500,
		}, async progress => {
			await this.bulkEditService.apply(edit, {
				undoRedoSource: UNDO_REDO_SOURCE,
				label: options.undoLabel,
				code: 'undoredo.explorerOperation',
				progress,
				token: cancellationTokenSource.token,
				confirmBeforeUndo: options.confirmBeforeUndo
			});
		}, () => cancellationTokenSource.cancel());
		await this.progressService.withProgress({ location: ProgressLocation.Explorer, delay: 500 }, () => promise);
		cancellationTokenSource.dispose();*/
	}

	async findValidPasteFileTarget(
		targetFolder: AddonEntry,
		fileToPaste: { resource: vscode.Uri; isDirectory?: boolean; allowOverwrite: boolean },
		incrementalNaming: 'simple' | 'smart' | 'disabled'
	): Promise<vscode.Uri | undefined> {
	
		let name = path.basename(fileToPaste.resource.path) || fileToPaste.resource.authority;
		let candidate = vscode.Uri.joinPath(targetFolder.uri, name);
	
		// In the disabled case we must ask if it's ok to overwrite the file if it exists
		if (incrementalNaming === 'disabled') {
			const canOverwrite = await this.askForOverwrite(candidate);

			if (!canOverwrite) {
				return;
			}
		}
	
		while (true && !fileToPaste.allowOverwrite) {
			if (!this.findClosest(candidate)) {
				break;
			}
	
			if (incrementalNaming !== 'disabled') {
				name = this.incrementFileName(name, !fileToPaste.isDirectory, incrementalNaming);
			}
			candidate = vscode.Uri.joinPath(targetFolder.uri, name);
		}
	
		return candidate;
	}

	async findClosest(resource: vscode.Uri): Promise<AddonEntry | null> {
		const folder = vscode.workspace.getWorkspaceFolder(resource);

		if (folder && folder?.uri) {
			const root = this.tree.find(r => r?.uri === folder.uri);

			if (root) {
				return await this.findByPath(resource.path, resource.path.length, true);
			}
		}

		return null;
	}

	incrementFileName(name: string, isFolder: boolean, incrementalNaming: 'simple' | 'smart'): string {
		if (incrementalNaming === 'simple') {
			let namePrefix = name;
			let extSuffix = '';
			if (!isFolder) {
				extSuffix = path.extname(name);
				namePrefix = path.basename(name, extSuffix);
			}
	
			// name copy 5(.txt) => name copy 6(.txt)
			// name copy(.txt) => name copy 2(.txt)
			const suffixRegex = /^(.+ copy)( \d+)?$/;
			if (suffixRegex.test(namePrefix)) {
				return namePrefix.replace(suffixRegex, (match, g1?, g2?) => {
					const number = (g2 ? parseInt(g2) : 1);
					return number === 0
						? `${g1}`
						: (number < 1 << 30
							? `${g1} ${number + 1}`
							: `${g1}${g2} copy`);
				}) + extSuffix;
			}
	
			// name(.txt) => name copy(.txt)
			return `${namePrefix} copy${extSuffix}`;
		}
	
		const separators = '[\\.\\-_]';
		const maxNumber = 1 << 30;
	
		// file.1.txt=>file.2.txt
		const suffixFileRegex = RegExp('(.*' + separators + ')(\\d+)(\\..*)$');
		if (!isFolder && name.match(suffixFileRegex)) {
			return name.replace(suffixFileRegex, (match, g1?, g2?, g3?) => {
				const number = parseInt(g2);
				return number < maxNumber
					? g1 + String(number + 1).padStart(g2.length, '0') + g3
					: `${g1}${g2}.1${g3}`;
			});
		}
	
		// 1.file.txt=>2.file.txt
		const prefixFileRegex = RegExp('(\\d+)(' + separators + '.*)(\\..*)$');
		if (!isFolder && name.match(prefixFileRegex)) {
			return name.replace(prefixFileRegex, (match, g1?, g2?, g3?) => {
				const number = parseInt(g1);
				return number < maxNumber
					? String(number + 1).padStart(g1.length, '0') + g2 + g3
					: `${g1}${g2}.1${g3}`;
			});
		}
	
		// 1.txt=>2.txt
		const prefixFileNoNameRegex = RegExp('(\\d+)(\\..*)$');
		if (!isFolder && name.match(prefixFileNoNameRegex)) {
			return name.replace(prefixFileNoNameRegex, (match, g1?, g2?) => {
				const number = parseInt(g1);
				return number < maxNumber
					? String(number + 1).padStart(g1.length, '0') + g2
					: `${g1}.1${g2}`;
			});
		}
	
		// file.txt=>file.1.txt
		const lastIndexOfDot = name.lastIndexOf('.');
		if (!isFolder && lastIndexOfDot >= 0) {
			return `${name.substr(0, lastIndexOfDot)}.1${name.substr(lastIndexOfDot)}`;
		}
	
		// 123 => 124
		const noNameNoExtensionRegex = RegExp('(\\d+)$');
		if (!isFolder && lastIndexOfDot === -1 && name.match(noNameNoExtensionRegex)) {
			return name.replace(noNameNoExtensionRegex, (match, g1?) => {
				const number = parseInt(g1);
				return number < maxNumber
					? String(number + 1).padStart(g1.length, '0')
					: `${g1}.1`;
			});
		}
	
		// file => file1
		// file1 => file2
		const noExtensionRegex = RegExp('(.*)(\\d*)$');
		if (!isFolder && lastIndexOfDot === -1 && name.match(noExtensionRegex)) {
			return name.replace(noExtensionRegex, (match, g1?, g2?) => {
				let number = parseInt(g2);
				if (isNaN(number)) {
					number = 0;
				}
				return number < maxNumber
					? g1 + String(number + 1).padStart(g2.length, '0')
					: `${g1}${g2}.1`;
			});
		}
	
		// folder.1=>folder.2
		if (isFolder && name.match(/(\d+)$/)) {
			return name.replace(/(\d+)$/, (match, ...groups) => {
				const number = parseInt(groups[0]);
				return number < maxNumber
					? String(number + 1).padStart(groups[0].length, '0')
					: `${groups[0]}.1`;
			});
		}
	
		// 1.folder=>2.folder
		if (isFolder && name.match(/^(\d+)/)) {
			return name.replace(/^(\d+)(.*)$/, (match, ...groups) => {
				const number = parseInt(groups[0]);
				return number < maxNumber
					? String(number + 1).padStart(groups[0].length, '0') + groups[1]
					: `${groups[0]}${groups[1]}.1`;
			});
		}
	
		// file/folder=>file.1/folder.1
		return `${name}.1`;
	}

	private async findByPath(path: string, index: number, ignoreCase: boolean): Promise<AddonEntry | null> {
		if (isEqual(rtrim(path, posix.sep), path, ignoreCase)) {
			return this._getTreeElement(path);
		}

		// Ignore separtor to more easily deduct the next name to search
		while (index < path.length && path[index] === posix.sep) {
			index++;
		}

		let indexOfNextSep = path.indexOf(posix.sep, index);
		if (indexOfNextSep === -1) {
			// If there is no separator take the remainder of the path
			indexOfNextSep = path.length;
		}
		// The name to search is between two separators
		const name = path.substring(index, indexOfNextSep);

		const childs = await this.getChildren(this._getTreeElement(name));

		if (childs.length > 0) {
			// We found a child with the given name, search inside it
			return this.findByPath(path, indexOfNextSep, ignoreCase);
		}

		return null;
	}

	async askForOverwrite(targetResource: vscode.Uri): Promise<boolean> {
		const exists = await _.exists(targetResource.fsPath);

		if (!exists) {
			return true;
		}

		// Ask for overwrite confirmation
		const dialogTitle = vscode.l10n.t(
			"A file or folder with the name '{0}' already exists in the destination folder. Do you want to replace it?", 
			path.basename(targetResource.path)
		);
		let confirmed = false;

		await vscode.window.showInformationMessage(
			dialogTitle,
			vscode.l10n.t("Replace"),
			vscode.l10n.t("No")
		).then(answer => {
			if (answer === vscode.l10n.t("Replace")) {
				confirmed = true;
			}
		});

		return confirmed;
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

class ContextKey {
	private _name: string;
	private _lastValue: boolean = false;

	constructor(name: string) {
		this._name = name;
	}

	public set(value: boolean): void {
		if (this._lastValue === value) {
			return;
		}
		this._lastValue = value;
		vscode.commands.executeCommand('setContext', this._name, this._lastValue);
	}
}
