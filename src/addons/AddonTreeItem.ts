import * as vscode from 'vscode';
import * as path from 'path';
import { AddonReader } from './AddonReader';

export function getAddonItem(
    addon: string, 
    addonReader: AddonReader, 
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
): Addon {
    const addonData = addonReader.getAddonData(addon);

    return new Addon(addon, addonData.addon.version, collapsibleState);
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