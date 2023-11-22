import * as vscode from 'vscode';

import { getAddonsPath } from './addons/AddonsPath';
import { AddonReader } from './addons/AddonReader';

import { AddonExplorer, Addon, selectAddon } from './addons/AddonExplorer';
import { showAddonPicker } from './addons/AddonPicker';

import * as messages from './addons/AddonMessages';
import { resolve } from 'path';


export function activate(context: vscode.ExtensionContext) {

	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;

	if (rootPath) {
		// Register addons explorer
		const addonsPath = getAddonsPath(rootPath);
		const addonReader = new AddonReader(addonsPath);

		const addonExplorer = new AddonExplorer(addonReader);
		vscode.window.registerTreeDataProvider('csAddonExplorer', addonExplorer);
		vscode.commands.registerCommand('csAddonExplorer.refreshEntry', () => addonExplorer.refresh());
		vscode.commands.registerCommand('csAddonExplorer.open', () => showAddonPicker(addonReader, addonExplorer, selectAddon));

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
export function deactivate() {}
