import * as vscode from 'vscode';
import * as fs from 'fs';

export function pathExists(p: AddonPath | string): boolean {
    try {
        fs.accessSync(p instanceof AddonPath ? p.path : p);
    } catch (err) {
        return false;
    }

    return true;
}


export class AddonPath {

    public compact_label: string = '';

	constructor(public path: string, public type: vscode.FileType) {
	}
}
