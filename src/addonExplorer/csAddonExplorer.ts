import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const { parseString } = require('xml2js');

const DOCUMENT_ERROR = 'addon.xml document is invalid???';

export class AddonNodeProvider implements vscode.TreeDataProvider<Addon> {

	private _onDidChangeTreeData: vscode.EventEmitter<Addon | undefined | void> = new vscode.EventEmitter<Addon | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Addon | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private workspaceRoot: string | undefined) {
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: Addon): vscode.TreeItem {
		return element;
	}

	getChildren(element?: Addon): Thenable<Addon[]> {

		if (!this.workspaceRoot) {
			vscode.window.showInformationMessage('No CS-Cart addons in workspace');
			return Promise.resolve([]);
		}

		if (element) {
			return Promise.resolve(
                this.getAddons(
                    path.join(
                        this.workspaceRoot, 'app', 'addons', 
                        element.label
                    )
                )
            );

		} else {
			const addonsPath = path.join(this.workspaceRoot, 'app', 'addons');

			if (this.pathExists(addonsPath)) {
				return Promise.resolve(this.getAddons(addonsPath));
			} else {
				vscode.window.showInformationMessage('Workspace has not CS-Cart addons');
				return Promise.resolve([]);
			}
		}
	}

	/**
	 * Given the path to addons, read all.
	 */
	private getAddons(addonsPath: string): Addon[] {
		const workspaceRoot = this.workspaceRoot;

		if (this.pathExists(addonsPath) && workspaceRoot) {
            const getAddonNames = (addonsPath:string) =>
                fs.readdirSync(addonsPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name).filter(
                        addon => this.pathExists(
                            path.join(addonsPath, addon, 'addon.xml')
                        )
                    );

            const getAddon = (addon:string): Addon => {

				var addonJson = '';
				const addonXml = fs.readFileSync(path.join(addonsPath, addon, 'addon.xml'), 'utf-8');

				const callback = (err: any, result: any) => {
                    if (err || !result) {
                        vscode.window.showErrorMessage(DOCUMENT_ERROR);
                    } else {
                        addonJson = JSON.stringify(result);
                    }
                };

				parseString(
					addonXml,
					callback
                );

                const addonData = JSON.parse(addonJson);

                return new Addon(addon, addonData.addon.version, vscode.TreeItemCollapsibleState.Collapsed);
            };

			const addonNames = getAddonNames(addonsPath);
			const addons = addonNames
				? Object.values(addonNames).map(addon => getAddon(addon))
				: [];

			return addons;

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

