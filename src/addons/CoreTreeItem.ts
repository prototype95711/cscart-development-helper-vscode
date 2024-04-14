import * as vscode from 'vscode';
import * as path from 'path';

export class Core extends vscode.TreeItem {

	constructor(
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command
	) {
		super('core', collapsibleState);

		this.tooltip = vscode.l10n.t('CS-Cart');
		this.description = '';
	}

	iconPath = {
		light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'core.svg'),
		dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'core.svg')
	};

	contextValue = 'core';
}
