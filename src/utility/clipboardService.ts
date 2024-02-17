import * as vscode from 'vscode';
import { IClipboardService } from './IClipboardService';

export class ClipboardService implements IClipboardService {

	private resources: vscode.Uri[] = [];
	
	declare readonly _serviceBrand: undefined;

	async writeResources(resources: vscode.Uri[]): Promise<void> {
		this.resources = resources;
	}

	async readResources(): Promise<vscode.Uri[]> {
		return this.resources;
	}

	async hasResources(): Promise<boolean> {
		return this.resources.length > 0;
	}
}
