import * as vscode from 'vscode';

import { AddonReader } from './addons/AddonReader';

import { AddonExplorer, Addon, selectAddon } from './addons/AddonExplorer';
import { showAddonPicker } from './addons/AddonPicker';

import * as messages from './addons/AddonMessages';
import { AddonFileDecorationProvider } from './addons/files/Decorator';

let disposables: vscode.Disposable[] = [];

export function activate(context: vscode.ExtensionContext) {

	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;

	if (rootPath) {
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
		context.subscriptions.push(view);

		context.subscriptions.push(vscode.commands.registerCommand(
			'csAddonExplorer.newFile', 
			(resource) => addonExplorer.newFile(resource)
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
