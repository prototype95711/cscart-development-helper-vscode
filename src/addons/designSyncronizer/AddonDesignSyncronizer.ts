import * as vscode from 'vscode';
import * as fs from 'fs';

import { Addon } from "../../treeview/AddonTreeItem";
import { AddonExplorer } from '../../addons/explorer/AddonExplorer';
import * as path from 'path';
import { DESIGN_CATALOG, DESIGN_THEMES_CATALOG, VAR_CATALOG, VAR_THEMES_REPOSITORY_CATALOG, getAddonDesignPathes, getThemeNames } from '../../addons/files/AddonFiles';
import { AddonPath, pathExists } from '../files/AddonPath';

interface DesignPath {
    folder: string,
    name: string
}

function handleResult<T>(resolve: (result: T) => void, reject: (error: Error) => void, error: Error | null | undefined, result: T): void {
    if (error) {
        reject(massageError(error));
    } else {
        resolve(result);
    }
}

function massageError(error: Error & { code?: string }): Error {
    if (error.code === 'ENOENT') {
        return vscode.FileSystemError.FileNotFound();
    }

    if (error.code === 'EISDIR') {
        return vscode.FileSystemError.FileIsADirectory();
    }

    if (error.code === 'EEXIST') {
        return vscode.FileSystemError.FileExists();
    }

    if (error.code === 'EPERM' || error.code === 'EACCES') {
        return vscode.FileSystemError.NoPermissions();
    }

    return error;
}


function exists(path: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
        fs.exists(path, exists => handleResult(resolve, reject, null, exists));
    });
}

export class AddonDesignSyncronizer {
    constructor(private addonExplorer: AddonExplorer) {

    }

    async sync(addon: Addon) {
        const designThemesPath = path.join(
            this.addonExplorer.addonReader.workspaceRoot, 
            DESIGN_CATALOG,
            DESIGN_THEMES_CATALOG
        );
        const varThemesRepPath = path.join(
            this.addonExplorer.addonReader.workspaceRoot, 
            VAR_CATALOG,
            VAR_THEMES_REPOSITORY_CATALOG
        );
        const onlyUnique = (value: AddonPath, index: number, array: AddonPath[]) => {
			return array.findIndex(addonPath => addonPath.path === value.path) === index;
		};

        var addonDesignPathes = await getAddonDesignPathes(
            this.addonExplorer.addonReader.workspaceRoot, 
            addon.addon,
            ['themes', 'repository']
        );

        addonDesignPathes = addonDesignPathes
            .filter(_path => _path && _path.path)
            .filter(onlyUnique)
            .filter(_path => pathExists(_path));

        if (addonDesignPathes.length > 0) {

            const designFiles: DesignPath[] = await this.getDesignFiles(addonDesignPathes);

            if (designFiles.length > 0) {
                designFiles.map(
                    async (filePathObj) => {
                        const isInVarRep = filePathObj.name.includes(varThemesRepPath);

                        if (isInVarRep) {

                            const pathInDesign = filePathObj.folder.replace(
                                varThemesRepPath,
                                designThemesPath
                            );
                            
                            if (!designFiles.includes(
                                    {folder: pathInDesign, name: filePathObj.name}
                                )
                            ) {
                                const cPath = vscode.Uri.file(
                                    path.join(filePathObj.folder, filePathObj.name)
                                );
                                this.addonExplorer.delete(cPath, {recursive: false});
                            }

                        } else {
                            const pathInRep = filePathObj.folder.replace(
                                designThemesPath,
                                varThemesRepPath
                            );
    
                            const cPath = vscode.Uri.file(
                                path.join(filePathObj.folder, filePathObj.name)
                            );
                            const cnNewPath = vscode.Uri.file(
                                path.join(pathInRep, filePathObj.name)
                            );
            
                            var buf = await this.addonExplorer.readFile(cPath);
                            this.addonExplorer.writeFile(
                                cnNewPath,
                                buf,
                                {create: true, overwrite: true}
                            );
                        }
                    }
                );
            }
        }
    }

    async getDesignFiles(addonDesignPathes: AddonPath[]): Promise<DesignPath[]> {
        var designFiles: DesignPath[] = [];

        await Promise.all(
            addonDesignPathes.map(async apath => {
                if (apath.type === vscode.FileType.Directory) {
                    const childrens = await this.addonExplorer.readDirectory(
                        vscode.Uri.file(apath.path)
                    );

                    if (childrens?.length > 0) {
                        var sFolders: AddonPath[] = [];
                        var folderDesignFiles: Array<{folder: string, name: string}> = new Array<{folder: string, name: string}>;
                        childrens.map(
                            ([name, type]) => {
                                if (type === vscode.FileType.Directory) {
                                    sFolders.push(new AddonPath(apath.path.concat('/', name), type));
                                } else {
                                    const filePathObj = {
                                        folder: apath.path, 
                                        name: name
                                    };
                                    folderDesignFiles.push(filePathObj);
                                }
                            }
                        );

                        if (sFolders.length > 0) {
                            const sFoldersFiles = await this.getDesignFiles(
                                sFolders
                            );

                            if (sFoldersFiles.length > 0) {
                                designFiles = designFiles.concat(sFoldersFiles);
                            }
                        }

                        designFiles = designFiles.concat(folderDesignFiles);
                    }
                }
            }
        ));

        return designFiles;
    }

    filePathToObj(name: string, type: vscode.FileType)
    {

    }
}