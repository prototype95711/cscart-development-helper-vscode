import * as vscode from 'vscode';

import { AddonReader } from './addons/AddonReader';

import { AddonEntry, AddonExplorer, selectAddon } from './addons/explorer/AddonExplorer';
import { showAddonPicker } from './addons/picker/AddonPicker';
import { AddonFileDecorationProvider } from './addons/explorer/Decorator';

import * as fs from 'fs';

import { addonConfFromObject, AddonsConfiguration, CONFIGURATION_FILE } from './configuration/addonsConfiguration';
import { anyEvent, filterEvent, relativePath } from './utility/events';
import { OverridesFinder, filterOverridePathPart, isOpenedFilesWithOverrides } from './design/overrides/OverridesFinder';
import { OverridesProvider } from './design/overrides/explorer/OverridesProvider';
import { Addon } from './treeview/AddonTreeItem';
import { ADDON_CATALOG, getAddonFromPath } from './addons/files/AddonFiles';
import { AddonPacker } from './addons/packer/AddonPacker';
import { AddonDesignSyncronizer } from './addons/designSyncronizer/AddonDesignSyncronizer';
import { showNewAddonFolderPicker } from './addons/newFolder/newFolderPicker';
import { showNewTranslateFilePicker } from './addons/newTranslateFile/newTranslateFilePicker';
import { AddonTranslator } from './addons/translator/AddonTranslator';

let isExplorerActive: boolean = false;
let disposables: vscode.Disposable[] = [];
let skipNextAddonFileHightlight: string[] = [];
let lastOpenedFilePath: string = '';

export async function activate(context: vscode.ExtensionContext) {

	const rootFolder = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0] : undefined;
	const rootPath = rootFolder !== undefined
		? rootFolder.uri.path : undefined;

	if (rootFolder && rootPath) {
		vscode.commands.executeCommand('setContext', 'isCsCartWorkspaces', true);
		vscode.commands.executeCommand('setContext', 'isAddonsOpened', false);

		// Register addons explorer
		const addonReader = new AddonReader(rootFolder);

		const addonExplorer = new AddonExplorer(addonReader);
		const addonDesignSyncronizer = new AddonDesignSyncronizer(addonExplorer);
		const addonPacker= new AddonPacker(addonReader);
		vscode.window.registerTreeDataProvider('csAddonExplorer', addonExplorer);
		context.subscriptions.push(
			vscode.commands.registerCommand('csAddonExplorer.openAddon', () => showAddonPicker(
				addonReader, 
				addonExplorer, 
				view,
				openAddon,
				addonExplorer.getOpenedAddonsList()
			))
		);
		context.subscriptions.push(
			vscode.commands.registerCommand('csAddonExplorer.refresh', () => addonExplorer.refresh())
		);
		context.subscriptions.push(
			vscode.commands.registerCommand('csAddonExplorer.closeAddons', () => {
				if (addonExplorer.getOpenedAddonsList()?.length > 0) {
					addonExplorer.getOpenedAddonsList().map(a => addonExplorer.unselectAddon(a, false));
					addonExplorer.saveCurrentConfiguration(true, true);
				}
				vscode.commands.executeCommand('setContext', 'isAddonsOpened', false);
			})
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('csAddonExplorer.addFolder', (resource) => showNewAddonFolderPicker(
				resource.addon,
				addonReader, 
				addonExplorer, 
				view,
				addAddonFolder
			))
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('csAddonExplorer.addTranslateFile', (resource) => showNewTranslateFilePicker(
				resource.addon,
				addonReader, 
				addonExplorer, 
				view,
				addAddonTranslateFile
			))
		);

		try {
			const conf = await getDataFromConfigurationFile(rootFolder, context);

			if (conf !== null) {
				const aConf = addonConfFromObject(conf);
				addonExplorer.applyConfiguration(aConf);
			}
		} catch (err) {
			vscode.window.showErrorMessage(vscode.l10n.t("Failed to initialize a CS Development Helper configuration."));
		}

		const view = vscode.window.createTreeView(
			'csAddonExplorer', 
			{ 
				treeDataProvider: addonExplorer, 
				showCollapseAll: true, 
				canSelectMany: true, 
				dragAndDropController: addonExplorer
			}
		);
		view.onDidChangeSelection(selection => {
			addonExplorer.selectItems(selection);
		});
		/*view.onDidChangeActiveItem(active => {
			addonExplorer.focusItems(active);
		});*/
		view.onDidExpandElement(expanded => {
			addonExplorer.expandItems(expanded);
		});
		view.onDidCollapseElement(collapsed => {
			addonExplorer.collapseItems(collapsed);
		});
		view.onDidChangeVisibility(e => {
			isExplorerActive = e.visible;

			if (isExplorerActive) {
				selectOpenedAddonFileInExplorer(addonExplorer, view);
			}
		});
		context.subscriptions.push(view);

		const overridesList = new OverridesProvider(rootPath, addonReader);
		vscode.window.registerTreeDataProvider('csOverridesList', overridesList);
		context.subscriptions.push(
			vscode.commands.registerCommand('csOverridesList.refresh', () => overridesList.refreshOverrides())
		);
		const viewOverrides = vscode.window.createTreeView(
			'csOverridesList', 
			{ 
				treeDataProvider: overridesList, 
				showCollapseAll: true, 
				canSelectMany: false
			}
		);
		const overridesFinder = new OverridesFinder(addonReader, rootPath);
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.findOverrides', 
			async (resource) => {
				const overrides = await overridesFinder.findOverridesForFile(resource);

				if (overrides?.length > 0) {
					const csFilepath = overrides.find(override => {
						return override.templatePath.trim();
					})?.templatePath;

					if (csFilepath) {
						overridesList.updateList(csFilepath, overrides);
					}

					vscode.commands.executeCommand("csOverridesList.focus");
				} else {
					vscode.window.showInformationMessage(vscode.l10n.t("No overrides founded"));
				}
			}
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'overridesProvider.openFile', 
			(resource) => {
				overridesList.openFile(resource);
				skipNextAddonFileHightlight.push(resource.path);
			}
		));
		context.subscriptions.push(viewOverrides);

		isOpenedFilesWithOverrides();

		context.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor(
				() => {
					refreshOverridesPanelData(overridesList);
					selectOpenedAddonFileInExplorer(addonExplorer, view);
				}
			)
		);

		context.subscriptions.push(
			vscode.window.onDidChangeTextEditorViewColumn(
				() => {
					refreshOverridesPanelData(overridesList);
					selectOpenedAddonFileInExplorer(addonExplorer, view);
				}
			)
		);

		context.subscriptions.push(
			vscode.workspace.onDidOpenTextDocument(
				() => {
					refreshOverridesPanelData(overridesList);
					selectOpenedAddonFileInExplorer(addonExplorer, view);
				}
			)
		);

		context.subscriptions.push(
			vscode.workspace.onDidOpenNotebookDocument(
				() => {
					selectOpenedAddonFileInExplorer(addonExplorer, view);
				}
			)
		);

		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.collapseAddonItems', 
			async (resource: Addon) => {
				const addonPathes = addonExplorer.tree.filter(ti => ti.addon === resource.addon);

				addonPathes.forEach(async apath => {
					addonExplorer.collapseItemsByUri(apath.addon.concat('/', apath.uri.path), false);
				});
				addonExplorer.collapseItemsByUri(resource.addon, false);

				await addonExplorer.closeAddon(resource).finally(function() {
					setTimeout(() => {
						openAddon(resource.addon, addonExplorer, view);
					}, 50);
				});
			}
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.normalizeLangVars', 
			(resource) => addonExplorer.normalizeTranslateFiles(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.translateAddon', 
			(resource) => addonExplorer.translateAddon(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.copyAddonName', 
			(resource) => addonExplorer.copyAddonName(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.packAddon', 
			(resource) => addonPacker.pack(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.syncDesignFiles', 
			(resource) => addonDesignSyncronizer.sync(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.closeAddon', 
			(resource) => addonExplorer.closeAddon(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.newFile', 
			(resource) => addonExplorer.newFile(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.newFolder', 
			(resource) => addonExplorer.newFolder(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.openFile', 
			(resource) => {
				addonExplorer.openFile(resource);
				skipNextAddonFileHightlight.push(resource.path);
			}
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.openFileToSide', 
			(resource) => addonExplorer.openFileToSide(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.revealFileInExplorer', 
			(resource) => addonExplorer.revealFileInExplorer(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.revealFileInOS.linux', 
			(resource) => addonExplorer.revealFileInOS(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.revealFileInOS.mac', 
			(resource) => addonExplorer.revealFileInOS(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.revealFileInOS.windows', 
			(resource) => addonExplorer.revealFileInOS(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.copyPath', 
			(resource) => addonExplorer.copyPath(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.copyRelativeFilePath', 
			(resource) => addonExplorer.copyRelativeFilePath(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.cut', 
			(resource) => addonExplorer.cut(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.copy', 
			(resource) => addonExplorer.copy(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.paste', 
			(resource) => addonExplorer.paste(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.findInFolder', 
			(resource) => addonExplorer.findInFolder(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.rename', 
			args => {
				if (args) {
					addonExplorer.renameCommand(args);
				}
			}
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.delete', 
			(resource) => addonExplorer.deleteCommand(resource)
		));

		const repositoryWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(
				vscode.Uri.file(rootPath), 
				'{**/app/**,**/design/**,**/js/**,**/var/langs/**,**/var/themes_repository/**}'
			)
		);
		context.subscriptions.push(repositoryWatcher);

		const onRepositoryFileChange = anyEvent(
			repositoryWatcher.onDidCreate, 
			repositoryWatcher.onDidDelete
		);
		const onRepositoryWorkingTreeFileChange = filterEvent(
			onRepositoryFileChange, uri => !/\.git($|\\|\/)/.test(
				relativePath(
					rootPath, uri.fsPath
				)
			)
		);

		const onFileChange = anyEvent(onRepositoryWorkingTreeFileChange);
		context.subscriptions.push(
			onFileChange(e => {
				const addon = getAddonFromPath(e.path);

				if (addon.length > 0) {
					addonExplorer.refreshAddonItems(addon);
				} else {
					addonExplorer.refresh();
				}
			})
		);

		addonExplorer.onDidRenameFile(e => {
			const oldResource = e.shift();
			const newResource = e.shift();

			if (
				newResource?.type === vscode.FileType.File
				&& oldResource !== undefined 
				&& newResource !== undefined
			) {
				closeTab(oldResource.uri);
				addonExplorer.openFile(newResource.uri);
			}
		});

		addonExplorer.onDidPasteCuttedFile(e => {
			const oldResource = e.source;
			const newResource = e.target;

			if (fs.lstatSync(oldResource.path).isFile()) {
				closeTab(oldResource);
				addonExplorer.openFile(newResource);
			}
		});

		addonExplorer.onDidNewFolder(folderPath => {
			const addon = getAddonFromPath(folderPath.path);

			if (addon.length > 0) {
				setTimeout(() => {
					selectAddonFileInExplorer(addon, folderPath.path, addonExplorer, view);
				}, 100);
			}
		});

		context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(e => {
			try {
				// initialize new source control for manually added workspace folders
				e.added.forEach(async wf => {
					const conf = await getDataFromConfigurationFile(wf, context);

					if (conf !== null) {
						const aConf = addonConfFromObject(conf);
						addonExplorer.applyConfiguration(aConf);
					}
				});
			} catch (ex) {

			}
		}));
		
		const fileDecorationProvider = new AddonFileDecorationProvider();
		context.subscriptions.push(
			addonExplorer.onDidCutFile(
				e => fileDecorationProvider.onCutFiles(e)
			)
		);
		context.subscriptions.push(fileDecorationProvider);

	} else {
		vscode.commands.executeCommand('setContext', 'isCsCartWorkspaces', false);
		vscode.window.showInformationMessage(vscode.l10n.t("No CS-Cart addons in workspace"));

		return;
	}
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (disposables) {
		disposables.forEach(item => item.dispose());
	}
	disposables = [];
}

async function addAddonFolder(selectedFolder: string, addonExplorer: AddonExplorer, view: vscode.TreeView<Addon | AddonEntry>) {
	addonExplorer.askNewFolder(
		vscode.Uri.file(addonExplorer.addonReader.workspaceRoot), 
		selectedFolder
	);
}

async function addAddonTranslateFile(selectedFile: string, addonExplorer: AddonExplorer, addon: string) {
	await addonExplorer.askNewFile(
		vscode.Uri.file(addonExplorer.addonReader.workspaceRoot), 
		selectedFile
	);
	const addonEl = addonExplorer.addonElms.find(a => a.label = addon), addonTranslator = addonEl ? new AddonTranslator(
		addonExplorer.addonReader,
		addonEl
	) : undefined;

	if (addonTranslator) {
		addonTranslator.onDidSaveTranslateFiles(function() {
			addonExplorer.refreshAddonItems(addon);
		});
	}
}

async function openAddon(addon: string, addonExplorer: AddonExplorer, view: vscode.TreeView<Addon | AddonEntry>) {
	selectAddon(addon, addonExplorer);

	setTimeout(() => {
		selectOpenedAddonFileInExplorer(addonExplorer, view);
	}, 100);
}

function refreshOverridesPanelData(overridesList: OverridesProvider) {
	isOpenedFilesWithOverrides();

	if (
		vscode.window.activeTextEditor 
		&& vscode.window.activeTextEditor.document.uri.scheme === 'file'
	) {
		overridesList.selectList(
			filterOverridePathPart(
				vscode.window.activeTextEditor.document.uri.path
			)
		);
	}
}

async function selectOpenedAddonFileInExplorer(explorer: AddonExplorer, explorerView: vscode.TreeView<Addon | AddonEntry>) {
	if (
		isExplorerActive
		&& vscode.window.activeTextEditor 
		&& vscode.window.activeTextEditor.document.uri.scheme === 'file'
	) {
		const filePath = vscode.window.activeTextEditor.document.uri.path;

		if (filePath && filePath !== lastOpenedFilePath) {

			lastOpenedFilePath = filePath;

			if (skipNextAddonFileHightlight.includes(filePath)) {
				skipNextAddonFileHightlight = skipNextAddonFileHightlight.filter(
					snai => snai !== filePath
				);
				
				return;
			}

			const addon = getAddonFromPath(filePath);

			if (addon.length > 0) {
				selectAddonFileInExplorer(addon, filePath, explorer, explorerView);
			}
		}
	}
}

async function selectAddonFileInExplorer(
	addon: string,
	filePath: string, 
	explorer: AddonExplorer, 
	explorerView: vscode.TreeView<Addon | AddonEntry>,
	parentPath: string = ''
) {
	const nearEl = await explorer.getNearVisibleTreeElement(addon, filePath, [], false);

	if (nearEl !== undefined ) {
		const nearElPath = nearEl instanceof Addon ? nearEl.addon : nearEl.uri.path;

		if (nearElPath === parentPath) {
			return;
		} 

		const isTargetEl = !(nearEl instanceof Addon) && nearEl.uri.path === filePath;

		if (isTargetEl) {

			try {
				const isFolder = fs.lstatSync(filePath).isDirectory();

				if (isFolder) {
					await explorerView.reveal(nearEl, {expand: true, focus: true, select: true});
				} else {
					await explorerView.reveal(nearEl, {select: true, focus: true});
				}
			} catch (e) {
				console.log(e);
			}

		} else if (
			parentPath.length === 0
			|| (nearEl instanceof Addon && parentPath === nearEl.addon)
			|| (
				!(nearEl instanceof Addon) 
				&& nearEl.uri.path !== parentPath
			)
		) {
			if (
				nearEl instanceof Addon 
				|| nearEl.addon === addon
			) {
				try {
					await explorerView.reveal(nearEl, {expand: true}).then(e => {
						selectAddonFileInExplorer(addon, filePath, explorer, explorerView, nearElPath);
					});
				} catch (e) {
					
				}

			} else {
				selectAddonFileInExplorer(addon, filePath, explorer, explorerView, nearElPath);
			}
		}
	}
}

async function getDataFromConfigurationFile(
	folder: vscode.WorkspaceFolder, 
	context: vscode.ExtensionContext
): Promise<object | null> {

	const configuration = vscode.workspace.getConfiguration("csDevHelper", folder)
		.get("addonExplorerConf", {});

	if (configuration) {
		return configuration;
	}

	return null;
}

function closeTab(fileUri: vscode.Uri) {
	var targetTab: vscode.Tab | null = null;

	vscode.window.tabGroups.all.forEach(tabGroup => {
		tabGroup.tabs.forEach(
			t => {
				const input = t.input;
				
				if (
					input instanceof vscode.TabInputText
					&& input.uri instanceof vscode.Uri
					&& input.uri.path === fileUri.path
				) {
					targetTab = t;
				}
			}
		);
	});

	if (targetTab !== null) {
		vscode.window.tabGroups.close(targetTab);
	}
}
