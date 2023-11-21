import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { window } from 'vscode';
const { parseString } = require('xml2js');

const ADDON_XML_FILENAME = 'addon.xml';
const ADDON_XML_ERROR = 'addon.xml document is invalid???';

/**
 * Shows a addon list
 */
export async function showAddonOpenerPopup(workspaceRoot: string | undefined) {

	if (!workspaceRoot) {
		vscode.window.showInformationMessage('No CS-Cart addons in workspace');
		return;
	}

	const addonsPath = path.join(workspaceRoot, 'app', 'addons');
	const addonOpener = new AddonOpener();

	let i = 0;
	const result = await window.showQuickPick(addonOpener.getAddonPickerList(addonsPath), {
		onDidSelectItem: item => window.showInformationMessage(`Focus ${++i}: ${item}`)
	});
	window.showInformationMessage(`Got: ${result}`);
	
	
}

export class AddonOpener {

	getAddonPickerList(addonsPath: string): vscode.QuickPickItem[] {
		const addonNames = this.getAddonList(addonsPath);

		const getAddonItems = (addonNames:string[]) => addonNames
			? addonNames.map(label => ({ label }))
			: [];

		return getAddonItems(addonNames);
	}

	private getAddonList(addonsPath: string): string[] {

		if (this.pathExists(addonsPath)) {

            const getAddonNames = (addonsPath:string) =>
                fs.readdirSync(addonsPath, { withFileTypes: true })
				.filter(dirent => dirent.isDirectory())
				.map(dirent => dirent.name).filter(
					addon => this.pathExists(
						path.join(addonsPath, addon, ADDON_XML_FILENAME)
					)
			);
			const addonNames = getAddonNames(addonsPath);

			return addonNames;

		} else {
			return [];
		}
	}

	private pathExists(p: string): boolean {
		try {
			fs.accessSync(p);
		} catch (err) {
			return false;
		}

		return true;
	}
}

