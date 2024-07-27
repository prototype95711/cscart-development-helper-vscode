import * as vscode from 'vscode';

import { Addon } from "../../treeview/AddonTreeItem";
import { AddonReader } from '../AddonReader';
import { FileStat } from '../../addons/explorer/AddonExplorer';
import * as afs from '../../utility/afs';
import * as path from 'path';
import * as fs from 'fs';
import { AddonPath } from '../files/AddonPath';
import { ADDON_CATALOG } from '../files/AddonFiles';
import { zip } from '../../utility/zip';

export class AddonPacker {

    constructor(private addonReader: AddonReader) {

    }
    
    async pack(addon: Addon) {
        const addonFiles = await this.getAddonFiles(addon);
        
        if (addonFiles.length > 0) {
            const saveDialog = vscode.window.showSaveDialog(
                {
                    defaultUri: vscode.Uri.file(path.join(this.addonReader.workspaceRoot, addon.label)),
                    filters: {'ZipArchive': ['zip']},
                    title: vscode.l10n.t("Save packed addon")
                }
            );

            const filesToZip = addonFiles.map(af => {
                return {
                    path: af.path.replace(this.addonReader.workspaceRoot + '/', ''),
                    localPath:  af.path
                };
            });

            saveDialog.then(e => {
                if (e?.path) {
                    zip(e.path, filesToZip);
                }
            });
        }
    }

    async getAddonFiles(addon: Addon, addonFolders: AddonPath[] = [], offset = 1, files: vscode.Uri[] = []): Promise<vscode.Uri[]> {

        if (addonFolders.length === 0) {
            addonFolders = await this.addonReader.getAddonPathes(addon.label, offset);
        }

        if (addonFolders.length > 0) {
            const addonCatalog = path.join(ADDON_CATALOG, addon.label);
            await Promise.all(
                addonFolders.map(async af => {

                    const isDirectory = af.type === vscode.FileType.Directory;

                    if (!af.path.includes(addonCatalog) || isDirectory) {

                        if (isDirectory) {
                            const folderElements = await this.getAddonFolderElements(
                                addon.label,
                                vscode.Uri.file(af.path),
                                offset
                            );
                            
                            if (folderElements.length > 0) {
                                await this.getAddonFiles(addon, folderElements, offset + 1, files);
                            }
                        }

                    } else {
                        files.push(vscode.Uri.file(af.path));
                    }
                })
            );
        }

        return files;
    }


    async getAddonFolderElements(addonLabel: string, element: vscode.Uri, offset = -1): Promise<AddonPath[]> {
        var offset = offset === -1 ? 1 : offset + 1;
        const addonPathes = await this.addonReader.getAddonPathes(
            addonLabel, 
            offset, 
            element.path
        );

        const result: AddonPath[] = [];

        if (addonPathes.length === 0) {
            const children = await this.readDirectory(element);

            children.sort((a, b) => {
                if (a[1] === b[1]) {
                    return a[0].localeCompare(b[0]);
                }
                return a[1] === vscode.FileType.Directory ? -1 : 1;
            });

            children.forEach(([name, type]) => {
                const filePath = path.join(element.fsPath, name);
                const addonPath = new AddonPath(
                    filePath,
                    fs.lstatSync(filePath).isDirectory() ? vscode.FileType.Directory : vscode.FileType.File
                );

                result.push(addonPath);
            });

            return result;

        } else {
            addonPathes.forEach(_path => {
                const filePath = _path.path;
                const addonPath = new AddonPath(
                    filePath,
                    fs.lstatSync(filePath).isDirectory() ? vscode.FileType.Directory : vscode.FileType.File
                );
                
                result.push(addonPath);
            });

            return result;
        }

		return [];
	}

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
		return this._readDirectory(uri);
	}

    async _readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const children = await afs.readdir(uri.fsPath);

		const result: [string, vscode.FileType][] = [];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const stat = await this._stat(path.join(uri.fsPath, child));
			result.push([child, stat.type]);
		}

		return Promise.resolve(result);
	}

    stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
		return this._stat(uri.fsPath);
	}

    async _stat(path: string): Promise<vscode.FileStat> {
		return new FileStat(await afs.stat(path));
	}
}
