import * as vscode from 'vscode';

export interface IClipboardService {

	readonly _serviceBrand: undefined;

	/**
	 * Writes resources to the system clipboard.
	 */
	writeResources(resources: vscode.Uri[]): Promise<void>;

	/**
	 * Reads resources from the system clipboard.
	 */
	readResources(): Promise<vscode.Uri[]>;

	/**
	 * Find out if resources are copied to the clipboard.
	 */
	hasResources(): Promise<boolean>;
}
