import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as afs from '../utility/afs';
import { AddonEntry, FileStat } from './AddonExplorer';
import { CSDesignPath, isOpenedFilesWithOverrides } from './OverridesFinder';
import { Addon, getAddonItem } from './AddonTreeItem';
import { AddonReader } from './AddonReader';
import { Core } from './CoreTreeItem';
import { ADDON_CATALOG } from './AddonFiles';

export class OverridesProvider implements vscode.TreeDataProvider<Addon | Core | OverrideEntry>, vscode.FileSystemProvider {
	private cache: CachedOverridesList[] = [];
	public list: CSDesignPath[] = [];

	public originalElement: CSDesignPath | undefined;

    private _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]>;
	
	private _onDidChangeTreeData: vscode.EventEmitter<Addon | Core | OverrideEntry | undefined | void> = new vscode.EventEmitter<Addon | Core | OverrideEntry | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Addon | Core | OverrideEntry | undefined | void> = this._onDidChangeTreeData.event;

	constructor(public workspaceRoot: string, private addonReader: AddonReader) {
		this._onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	}

	get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}

    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
		const watcher = fs.watch(uri.fsPath, { recursive: options.recursive }, async (event, filename) => {
			if (filename) {
				const filepath = path.join(uri.fsPath, afs.normalizeNFC(filename.toString()));

				this._onDidChangeFile.fire([{
					type: event === 'change' ? vscode.FileChangeType.Changed : await afs.exists(filepath) ? vscode.FileChangeType.Created : vscode.FileChangeType.Deleted,
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
		return new FileStat(await afs.stat(path));
	}

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
		return this._readDirectory(uri);
	}

    async _readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const children = await afs.readdir(uri.fsPath);

		const result: [string, vscode.FileType][] = [];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const stat = await this._stat(path.join(uri.fsPath, child));
			result.push([child, stat.type]);
		}

		return Promise.resolve(result);
	}

    createDirectory(uri: vscode.Uri): void | Thenable<void> {
		return afs.mkdir(uri.fsPath);
	}

	readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
		return afs.readfile(uri.fsPath);
	}

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
		return this._writeFile(uri, content, options);
	}

    async _writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
		const exists = await afs.exists(uri.fsPath);
		if (!exists) {
			if (!options.create) {
				throw vscode.FileSystemError.FileNotFound();
			}

			await afs.mkdir(path.dirname(uri.fsPath));
		} else {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			}
		}

		return afs.writefile(uri.fsPath, content as Buffer);
	}

    delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
		if (options.recursive) {
			return afs.rmrf(uri.fsPath);
		}

		return afs.unlink(uri.fsPath);
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
		return this._rename(oldUri, newUri, options);
	}

    async _rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
		const exists = await afs.exists(newUri.fsPath);
		if (exists) {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			} else {
				await afs.rmrf(newUri.fsPath);
			}
		}

		const parentExists = await afs.exists(path.dirname(newUri.fsPath));
		if (!parentExists) {
			await afs.mkdir(path.dirname(newUri.fsPath));
		}

		return afs.rename(oldUri.fsPath, newUri.fsPath);
	}

    async getChildren(element?: Addon | OverrideEntry): Promise<Addon[] | Core[] | Array<Addon | Core> | OverrideEntry[]> {
		if (element instanceof Addon) {
			const overrideFiles = this.list.filter(l => l.addon === element.addon);
			const result: OverrideEntry[] = [];

			if (overrideFiles.length > 0) {
				overrideFiles.forEach(_path => {
					const entry: OverrideEntry = { 
						uri: vscode.Uri.file(_path.fullPath), 
						type: vscode.FileType.File,
						csPath: _path.fullPath.replace(this.workspaceRoot, '')
					};
					result.push(entry);
				});
				
			} else if (
				this.originalElement !== undefined
				&& this.originalElement.addon === element.addon
			) {
				const entry: OverrideEntry = { 
					uri: vscode.Uri.file(this.originalElement.fullPath), 
					type: vscode.FileType.File,
					csPath: this.originalElement.fullPath.replace(this.workspaceRoot, '')
				};
				result.push(entry);
			}

			return result;
		}

		if (element instanceof Core) {
			const coreFile = this.list.find(l => l.templatePath.trim());
			const result: OverrideEntry[] = [];

			if (coreFile) {
				const entry: OverrideEntry = { 
					uri: vscode.Uri.file(coreFile.templatePath), 
					type: vscode.FileType.File,
					csPath: coreFile.templatePath.replace(this.workspaceRoot, '')
				};

				result.push(entry);
			}

			return result;
		}

		if (this.list.length > 0) {
			var result: Array<Addon | Core> = this.getAddons();

			if (result.length > 0) {
				const coreFile = this.list.find(l => l.templatePath.trim());

				if (coreFile) {
					const addonPathRegExp = new RegExp('[/](' + ADDON_CATALOG + ')[/][√\\w.]*[/]');
					
					if (addonPathRegExp.test(coreFile.templatePath)) {
						const addonPath = addonPathRegExp.exec(coreFile.templatePath);
						
						if (addonPath?.length) {
							const addonPathPieces = addonPath[0].split('/');
							const addon = addonPathPieces.filter(p => p.trim()).pop();

							if (addon && this.list.findIndex(l => l.addon === addon) === -1) {
								result.push(getAddonItem(addon, this.addonReader));
								const entry: CSDesignPath = { 
									addon: addon,
									path: coreFile.templatePath.replace(this.workspaceRoot, ''),
									fullPath: coreFile.templatePath, 
									templatePath: coreFile.templatePath,
									designPath: coreFile.designPath 
								};
				
								this.originalElement = entry;
							}
						}
						
					} else {
						result.push(new Core(vscode.TreeItemCollapsibleState.Collapsed));
					}
				}
			}

			return result;
		}

		return [];
	}

	/**
	 * Given the selected addons
	 */
	private getAddons(): Addon[] {
		var addons: string[] = this.list.map(item => item.addon);
		var addonObjects: Addon[] = addons.length > 0
			? addons.map(addon => getAddonItem(addon, this.addonReader))
			: [];

		addonObjects = addonObjects.map(a => {
			if (a.data?.addon?.priority) {
				a.label += ' ' + vscode.l10n.t("priority:") + ' ' + a.data?.addon?.priority;
			}
			return a;
		});

		addonObjects.sort((a, b) => {

			if (!a.data?.addon?.priority) {
				return 1;
				
			} else if (!b.data?.addon?.priority) {
				return -1;
			}

			if (a.data.addon.priority < b.data?.addon?.priority) {
				return -1;
			}

			return 0;
		});

		return addonObjects;
	}

    getTreeItem(element: Addon | Core | OverrideEntry): vscode.TreeItem {

		if (element instanceof Addon || element instanceof Core) {
			return element;
		}

		const treeItem = new vscode.TreeItem(
			element.uri, 
			element.type === vscode.FileType.Directory 
				? vscode.TreeItemCollapsibleState.Collapsed 
				: vscode.TreeItemCollapsibleState.None
		);

		treeItem.label = element.csPath;
		
		if (element.type === vscode.FileType.File) {
			treeItem.command = { 
				command: 'overridesProvider.openFile', 
				title: vscode.l10n.t("Open File"), 
				arguments: [element.uri]
			};
			treeItem.contextValue = 'file';
		}
		return treeItem;
	}

	refreshOverrides(): void {
		if (isOpenedFilesWithOverrides()) {
			vscode.commands.executeCommand(
				'csAddonExplorer.findOverrides',
				vscode.window.activeTextEditor?.document
					? vscode.window.activeTextEditor.document.uri
					: undefined
			);
		}
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
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

	public async updateList(filepath: string, overridesList: CSDesignPath[]) {
		this.cache.push({path: filepath, list: overridesList});
		this.selectList(filepath);
	}

	public async selectList(filepath: string) {
		this.originalElement = undefined;
		const cached = this.cache.findIndex(c => {return c.path === filepath;});

		if (cached !== -1) {
			this.list = this.cache[cached].list;
		} else {
			this.list = [];
		}

		this.refresh();
	}
}

interface OverrideEntry {
	uri: vscode.Uri;
	type: vscode.FileType;
	csPath: string;
}

interface CachedOverridesList {
	path: string;
	list: CSDesignPath[]
}
