import * as vscode from 'vscode';

import { AddonReader } from './addons/AddonReader';

import { AddonExplorer, Addon, selectAddon } from './addons/AddonExplorer';
import { showAddonPicker } from './addons/AddonPicker';

import * as messages from './addons/AddonMessages';
import { AddonFileDecorationProvider } from './addons/files/Decorator';

import path from 'path';
import * as afs from './utility/afs';

import { AddonsConfiguration, CONFIGURATION_FILE } from './addons/config/addonsConfiguration';
import { anyEvent, filterEvent, relativePath } from './utility/events';
import { OverridesFinder, isOpenedFilesWithOverrides } from './addons/OverridesFinder';
import { OverridesProvider } from './addons/OverridesProvider';

let disposables: vscode.Disposable[] = [];

export async function activate(context: vscode.ExtensionContext) {

	const rootFolder = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0] : undefined;
	const rootPath = rootFolder !== undefined
		? rootFolder.uri.path : undefined;

	if (rootFolder && rootPath) {
		// Register addons explorer
		const addonReader = new AddonReader(rootPath);

		const addonExplorer = new AddonExplorer(addonReader);
		vscode.window.registerTreeDataProvider('csAddonExplorer', addonExplorer);
		context.subscriptions.push(
			vscode.commands.registerCommand('csAddonExplorer.refreshEntry', () => addonExplorer.refresh())
		);
		context.subscriptions.push(
			vscode.commands.registerCommand('csAddonExplorer.open', () => showAddonPicker(
				addonReader, 
				addonExplorer, 
				selectAddon
			))
		);

		try {
			const conf = await getDataFromConfigurationFiles(context);
			conf.map(c => addonExplorer.applyConfiguration(c, rootFolder));
		} catch (err) {
			console.log('Failed to initialize a CS Development Helper configuration.');
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
		context.subscriptions.push(view);
		
		isOpenedFilesWithOverrides();

		context.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor(
				() => isOpenedFilesWithOverrides()
			)
		);

		const overridesFinder = new OverridesFinder(addonReader, rootPath);
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.findOverrides', 
			(resource) => overridesFinder.findOverridesForFile(resource)
		));
		const overridesList = new OverridesProvider();
		const viewOverrides = vscode.window.createTreeView(
			'csOverridesList', 
			{ 
				treeDataProvider: overridesList, 
				showCollapseAll: true, 
				canSelectMany: false
			}
		);
		context.subscriptions.push(viewOverrides);

		context.subscriptions.push(vscode.window.onDidChangeTextEditorViewColumn(e => console.log('onDidChangeTextEditorViewColumn')));
		context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(e => console.log('onDidOpenTextDocument')));
		context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(e => console.log('onDidCloseTextDocument')));

		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.normalizeLangVars', 
			(resource) => addonExplorer.normalizeTranslateFiles(resource)
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.translateAddon', 
			(resource) => addonExplorer.translateAddon(resource)
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
			new vscode.RelativePattern(vscode.Uri.file(rootPath), '**')
		);
		context.subscriptions.push(repositoryWatcher);

		const onRepositoryFileChange = anyEvent(
			repositoryWatcher.onDidChange, 
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
			onFileChange(e => {addonExplorer.refresh();})
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
		vscode.window.showInformationMessage(messages.NO_ADDONS_IN_WORKSPACE_ERROR);
		return;
	}
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "cscart-development-helper" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('cscart-development-helper.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from CSCart Development Helper!');
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (disposables) {
		disposables.forEach(item => item.dispose());
	}
	disposables = [];
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
			)
		);
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
