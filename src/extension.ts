import * as vscode from 'vscode';

import { AddonReader } from './addons/AddonReader';

import { AddonEntry, AddonExplorer, selectAddon } from './addons/explorer/AddonExplorer';
import { showAddonPicker } from './addons/picker/AddonPicker';
import { AddonFileDecorationProvider } from './addons/explorer/Decorator';

import path from 'path';
import * as afs from './utility/afs';

import { AddonsConfiguration, CONFIGURATION_FILE } from './configuration/addonsConfiguration';
import { anyEvent, filterEvent, relativePath } from './utility/events';
import { OverridesFinder, filterOverridePathPart, isOpenedFilesWithOverrides } from './design/overrides/OverridesFinder';
import { OverridesProvider } from './design/overrides/explorer/OverridesProvider';
import { Addon } from './treeview/AddonTreeItem';
import { ADDON_CATALOG, getAddonFromPath } from './addons/files/AddonFiles';

let refreshNumber = 0;
let isExplorerActive: boolean = false;
let disposables: vscode.Disposable[] = [];

export async function activate(context: vscode.ExtensionContext) {

	const rootFolder = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0] : undefined;
	const rootPath = rootFolder !== undefined
		? rootFolder.uri.path : undefined;

	if (rootFolder && rootPath) {
		vscode.commands.executeCommand('setContext', 'isCsCartWorkspaces', true);

		// Register addons explorer
		const addonReader = new AddonReader(rootPath);

		const addonExplorer = new AddonExplorer(addonReader);
		vscode.window.registerTreeDataProvider('csAddonExplorer', addonExplorer);
		context.subscriptions.push(
			vscode.commands.registerCommand('csAddonExplorer.openAddon', () => showAddonPicker(
				addonReader, 
				addonExplorer, 
				view,
				openAddon
			))
		);
		context.subscriptions.push(
			vscode.commands.registerCommand('csAddonExplorer.refresh', () => addonExplorer.refresh())
		);

		try {
			const conf = await getDataFromConfigurationFiles(context);

			if (conf.length > 0) {
				conf.map(c => addonExplorer.applyConfiguration(c, rootFolder));
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
			(resource) => overridesList.openFile(resource)
		));
		context.subscriptions.push(viewOverrides);

		isOpenedFilesWithOverrides();
		selectOpenedAddonFileInExplorer(addonExplorer, view);

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
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.collapseAddonItems', 
			async (resource: Addon) => {
				await addonExplorer.closeAddon(resource);
				await addonExplorer.collapseAddonFiles(resource).finally(function() {
					addonExplorer.openAddon(resource.addon);
					addonExplorer.refreshAddonItems(resource.addon);
					addonExplorer.saveCurrentConfiguration();
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
			(resource) => addonExplorer.openFile(resource)
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
				'{**/app/**,**/design/**,**/js/**,**/var/themes_repository/**}'
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

		const onFileDelete = anyEvent(repositoryWatcher.onDidDelete);
		context.subscriptions.push(
			onFileDelete(e => {
				addonExplorer.compactTree = addonExplorer.compactTree.filter(i => i.uri.path !== e.path);
			})
		);

		context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(e => {
			try {
				// initialize new source control for manually added workspace folders
				e.added.forEach(async wf => {
					const conf = await getDataFromConfigurationFiles(context);
					conf.map(c => addonExplorer.applyConfiguration(c, wf));
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

		if (filePath) {
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
	const nearEl = await explorer.getNearVisibleTreeElement(addon, filePath);

	if (nearEl !== undefined ) {
		const nearElPath = nearEl instanceof Addon ? nearEl.addon : nearEl.uri.path;

		if (nearElPath === parentPath) {
			return;
		} 

		const isTargetEl = !(nearEl instanceof Addon) && nearEl.uri.path === filePath;

		if (isTargetEl) {
			explorerView.reveal(nearEl, {select: true, focus: true});

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
				explorerView.reveal(nearEl, {expand: true}).then(e => {
					selectAddonFileInExplorer(addon, filePath, explorer, explorerView, nearElPath);
				});

			} else {
				selectAddonFileInExplorer(addon, filePath, explorer, explorerView, nearElPath);
			}
		}
	}
}

async function getDataFromConfigurationFiles(context: vscode.ExtensionContext): Promise<AddonsConfiguration[]> {
	if (!vscode.workspace.workspaceFolders) { return []; }

	var config: AddonsConfiguration[] = [];

	try {
		await Promise.all(vscode.workspace.workspaceFolders.map(
			async (folder) => {
				var conf = await getDataFromConfigurationFile(
					folder, 
					context
				);

				if (conf !== null) {
					config.push(conf);
				}
			}
		));
	} catch (ex) {
		
	} finally {
		return config;
	}
}

async function getDataFromConfigurationFile(
	folder: vscode.WorkspaceFolder, 
	context: vscode.ExtensionContext
): Promise<AddonsConfiguration | null> {
	const configurationPath = path.join(folder.uri.fsPath, CONFIGURATION_FILE);
	const configFileExists = await afs.exists(configurationPath);

	if (configFileExists) {
		const data = await afs.readFile(configurationPath);
		const addonConfiguration = <AddonsConfiguration>JSON.parse(data.toString('utf-8'));

		return addonConfiguration;
	}

	return null;
}
