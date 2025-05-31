import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as afs from '../../../utility/afs';
import { AddonEntry, FileStat } from '../../../addons/explorer/AddonExplorer';
import { CSDesignPath, designThemesCatalog, findOverrideInAltCatalog, findOverridesInAltCatalog, findOverridesInThemes, isOpenedFilesWithOverrides, varThemeRepCatalog } from '../OverridesFinder';
import { Addon, getAddonItem } from '../../../treeview/AddonTreeItem';
import { AddonReader } from '../../../addons/AddonReader';
import { Core } from '../../../treeview/CoreTreeItem';
import { ADDON_CATALOG, DESIGN_THEMES_CATALOG, VAR_THEMES_REPOSITORY_CATALOG } from '../../../addons/files/AddonFiles';

const DESIGN_FOLDER_PLACEHOLDER = '$designFolder$';
const DESIGN_THEME_FOLDER_PLACEHOLDER = '$themeFolder$';

export class OverridesProvider implements vscode.TreeDataProvider<Addon | Core | OverrideEntry>, vscode.FileSystemProvider {
	private cache: CachedOverridesList[] = [];
	public list: CSDesignPath[] = [];

	public originalElement: CSDesignPath[] = [];

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
				
			} else if (this.originalElement.length > 0) {

				var handled: string[] = [];
				const oe = this.originalElement.filter(e => e.addon === element.addon);

				if (oe.length > 0) {
					await Promise.all(oe.map(async e => {

						if (!handled.includes(e.path)){
							if (
								e.fullPath.includes(
								designThemesCatalog
								)
								|| e.fullPath.includes(
									varThemeRepCatalog
								)
							) {
								handled.push(e.path);
								var presult: Array<CSDesignPath> = [];
	
								await findOverridesInThemes(
									{
										addon: e.addon,
										path: e.path,
										fullPath: e.templatePath, 
										templatePath: e.templatePath, //original file fullpath
										designPath: e.designPath,
										theme: e.theme
									},
									'',
									presult,
									this.workspaceRoot,
									true
								);
	
								if (presult.length > 0) {
									await findOverridesInAltCatalog(
										'',
										presult,
										this.workspaceRoot,
										true
									);
								}
	
								if (presult.length > 0) {
									presult.map(pr => {
										const entry: OverrideEntry = { 
											uri: vscode.Uri.file(pr.templatePath), 
											type: vscode.FileType.File,
											csPath: pr.templatePath.replace(this.workspaceRoot, '')
										};
										result.push(entry);
									});
								}
							} else {
								const entry: OverrideEntry = { 
									uri: vscode.Uri.file(e.fullPath), 
									type: vscode.FileType.File,
									csPath: e.fullPath.replace(this.workspaceRoot, '')
								};
								result.push(entry);
							}
						}
					}));
				}
			}

			result.sort((a, b) => {

				if (a.uri.path < b.uri.path) {
					return -1;
				}
	
				return 0;
			});

			return result;
		}

		if (element instanceof Core) {
			const coreFile = this.list.find(l => l.templatePath.trim());
			const result: OverrideEntry[] = [];

			if (coreFile) {

				if (coreFile.fullPath.includes(
						designThemesCatalog
					)
					|| coreFile.fullPath.includes(
						varThemeRepCatalog
					)
				) {
					var presult: Array<CSDesignPath> = [];

					presult = await findOverridesInThemes(
						{
							addon: '',
							path: coreFile.path,
							fullPath: coreFile.templatePath, 
							templatePath: coreFile.templatePath, //original file fullpath
							designPath: coreFile.designPath,
							theme: coreFile.theme
						},
						'',
						presult,
						this.workspaceRoot
					);

					if (presult.length > 0) {
						presult = await findOverridesInAltCatalog(
							'',
							presult,
							this.workspaceRoot
						);
					}

					if (presult.length > 0) {
						presult.map(pr => {
							const entry: OverrideEntry = { 
								uri: vscode.Uri.file(pr.templatePath), 
								type: vscode.FileType.File,
								csPath: pr.templatePath.replace(this.workspaceRoot, '')
							};
							result.push(entry);
						});
					}
					
				} else {
					const entry: OverrideEntry = { 
						uri: vscode.Uri.file(coreFile.templatePath), 
						type: vscode.FileType.File,
						csPath: coreFile.templatePath.replace(this.workspaceRoot, '')
					};
	
					result.push(entry);
				}
			}

			result.sort((a, b) => {

				if (a.uri.path < b.uri.path) {
					return -1;
				}
	
				return 0;
			});

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
								const addonItem = getAddonItem(
									addon, 
									this.addonReader, 
									vscode.TreeItemCollapsibleState.Collapsed, 
									false
								);

								if (addonItem !== null) {
									result.push(addonItem);
								}
								
								const entry: CSDesignPath = { 
									addon: addon,
									path: coreFile.path,
									fullPath: coreFile.templatePath, 
									templatePath: coreFile.templatePath,
									designPath: coreFile.designPath,
									theme: coreFile.theme
								};
				
								this.originalElement.push(entry);
								var rPath = '';

								if (entry.fullPath.includes(designThemesCatalog)) {
									rPath = entry.fullPath.replace(
										designThemesCatalog,
										varThemeRepCatalog
									);
								} else if (entry.fullPath.includes(varThemeRepCatalog)) {
									rPath = entry.fullPath.replace(
										varThemeRepCatalog,
										designThemesCatalog
									);
								}

								if (rPath.length > 0 && await afs.exists(rPath)) {
									const rEntry: CSDesignPath = { 
										addon: addon,
										path: coreFile.path,
										fullPath: rPath, 
										templatePath: rPath,
										designPath: coreFile.designPath ,
										theme: coreFile.theme
									};

									this.originalElement.push(rEntry);
								}
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
		const onlyUnique = (value: CSDesignPath, index: number, array: CSDesignPath[]) => {
			return array.findIndex(path => path.addon === value.addon) === index;
		};

		var addons: string[] = this.list.filter(onlyUnique).map(item => item.addon);
		var addonObjectsSource: Array<Addon | null> = addons.length > 0
			? addons.map(
				addon => getAddonItem(
					addon, 
					this.addonReader, 
					vscode.TreeItemCollapsibleState.Collapsed, 
					false
				)
			)
			: [];

		var addonObjects: Addon[] = [];

		addonObjectsSource.map(ao => {
			if (ao !== null && ao instanceof Addon) {
				addonObjects.push(ao);
			}
		});

		addonObjects = addonObjects.map(a => {
			if (a !== null && a.data?.addon?.priority) {
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
		filepath = this.setPlaceholder(filepath);
			
		this.cache = this.cache.filter(c => c.path !== filepath);
		this.cache.push({path: filepath, list: overridesList});
		this.selectList(filepath);
	}

	public async selectList(filepath: string) {
		filepath = this.setPlaceholder(filepath);
		this.originalElement = [];
		const cached = this.cache.findIndex(c => {return c.path === filepath;});

		if (cached !== -1) {
			this.list = this.cache[cached].list;
		} else {
			this.list = [];
		}

		this.refresh();
	}

	private setPlaceholder(filepath: string): string {
		return filepath.replace(
			new RegExp("[/](" + designThemesCatalog + "|" + varThemeRepCatalog + ")[/][√\\w.]*[/]"), 
			'/themes/' + DESIGN_THEME_FOLDER_PLACEHOLDER + '/'
		);
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
