import * as vscode from 'vscode';
import * as path from 'path';
import { AddonReader } from '../addons/AddonReader';

export const UNKNOWN_ADDON_VALUE = 'unknown_addon';
export const ADDON_CONTEXT_VALUE = 'addon';

const addonRep: Addon[] = [];

export function getAddonItem(
    addon: string, 
    addonReader: AddonReader, 
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed,
	findInRep: Boolean = true
): Addon | null {
    const addonData = addonReader.getAddonData(addon);

	if (addonData !== null) {
		const existKey = findInRep ? addonRep.findIndex(ai => ai.addon === addon) : -1;

		if (existKey > -1) {
			addonRep[existKey].data = addonData;
			addonRep[existKey].collapsibleState = collapsibleState;
		}
	
		const addonItem = existKey > -1 ? addonRep[existKey] : new Addon(addon, addonData, collapsibleState);
	
		if (existKey < 0 && findInRep) {
			addonRep.push(addonItem);
		}

		return addonItem;
	}

	return null;
}

export class Addon extends vscode.TreeItem {

	public addon: string = '';
	public schemeVersion: string = '';

	constructor(
		public label: string,
		public data: any,
		public collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command
	) {
		super(label, collapsibleState);

		this.schemeVersion = this.data?.addon?.$?.scheme;

		this.addon = label;
		this.tooltip = `${this.label}`;
		this.description = '';

		if (this.data?.addon?.version) {
			this.tooltip += `-${this.data.addon.version}`;
			this.description = this.data.addon.version;
		}

		if (this.schemeVersion === '3.0' || this.schemeVersion === '4.0') {
			this.contextValue = ADDON_CONTEXT_VALUE;
		}
	}

	iconPath = {
		light: vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'light', 'addon.svg')),
		dark: vscode.Uri.file(path.join(__filename, '..', '..', '..', 'resources', 'dark', 'addon.svg'))
	};
	contextValue = UNKNOWN_ADDON_VALUE;
}