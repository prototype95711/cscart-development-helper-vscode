import * as vscode from 'vscode';
import { window } from 'vscode';

import { AddonReader } from '../AddonReader';
import { AddonEntry, AddonExplorer } from '../explorer/AddonExplorer';
import { Addon } from '../../treeview/AddonTreeItem';

/**
 * Shows a addon list
 */
export async function showAddonPicker(
	addonReader: AddonReader, 
	addonExplorer: AddonExplorer,
	view: vscode.TreeView<Addon | AddonEntry>,
	onDidChangeSelectionCallback: (
		selectedAddon: string,
		addonExplorer: AddonExplorer, 
		view: vscode.TreeView<Addon | AddonEntry>
	) => Promise<void>
) {
	const addonPicker = new AddonPicker(addonReader);

	const addonPick = window.createQuickPick();
	addonPick.items = addonPicker.getAddonPickerList();
	addonPick.onDidChangeSelection(selection => {
		if (selection[0]) {
			onDidChangeSelectionCallback(selection[0].label, addonExplorer, view);
		}
		addonPick.hide();
	});
	addonPick.onDidHide(() => addonPick.dispose());
	addonPick.show();
}

class AddonPicker {

	constructor(private addonReader: AddonReader) {
	}

	getAddonPickerList(): vscode.QuickPickItem[] {
		const addonNames = this.addonReader.getAddons();

		const getAddonItems = (addonNames:string[]) => addonNames
			? addonNames.map(label => ({ label }))
			: [];

		return getAddonItems(addonNames);
	}
}

