import * as vscode from 'vscode';
import * as path from 'path';

import { AddonReader } from './AddonReader';

const NO_SELECTED_ADDONS_ERROR = 'Not selected addons for work';

export async function selectAddon(addon: string, addonExplorer: AddonExplorer) {
	addonExplorer.add(addon);
}

export class AddonExplorer implements vscode.TreeDataProvider<Addon> {

	private _selectedAddons: string[] = [];

	private _onDidChangeTreeData: vscode.EventEmitter<Addon | undefined | void> = new vscode.EventEmitter<Addon | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Addon | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private addonReader: AddonReader) {
	}

	add(addon: string): void {
		
		if (this._selectedAddons.indexOf(addon) === -1) {
			this._selectedAddons.push(addon);
		}

		this.refresh();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: Addon): vscode.TreeItem {
		return element;
	}

	getChildren(element?: Addon): Thenable<Addon[]> {

		if (!this._selectedAddons.length) {
			vscode.window.showInformationMessage(NO_SELECTED_ADDONS_ERROR);
			return Promise.resolve([]);
		}

		if (element) {
			return Promise.resolve([this.getAddonItem(element.label)]);

		} else {
			return Promise.resolve(this.getAddons());
		}
	}

	private getAddonItem(addon:string): Addon {
		const addonData = this.addonReader.getAddonData(addon);

		return new Addon(addon, addonData.addon.version, vscode.TreeItemCollapsibleState.Collapsed);
	}

	/**
	 * Given the selected addons
	 */
	private getAddons(): Addon[] {
		const addonNames = this.addonReader.getAddons().filter(
			addon => this._selectedAddons.indexOf(addon) !== -1
		);
		const addons = addonNames
			? Object.values(addonNames).map(addon => this.getAddonItem(addon))
			: [];

		return addons;
	}
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

