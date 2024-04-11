import * as vscode from 'vscode';
import * as afs from '../utility/afs';

import { AddonReader } from './AddonReader';
import { ADDON_CATALOG, DESIGN_BACKEND_CATALOG, DESIGN_CATALOG, DESIGN_MAIL_CATALOG, DESIGN_PARTS, DESIGN_TEMPLATES_CATALOG, DESIGN_THEMES_CATALOG, VAR_CATALOG, VAR_THEMES_REPOSITORY_CATALOG, getAddonDesignPathes } from './AddonFiles';
import { readDirectory } from '../utility/afs';
import path from 'path';
import { Console } from 'console';

const fileExtensionWithOverrides = '.tpl';
const overridesPath = 'overrides';

export class OverridesFinder {
    
    constructor(private addonReader: AddonReader, private workspaceRoot: string) {
	}

    async findOverridesForFile(filepath: any) : Promise<CSDesignPath[]> {
        if (
            !(filepath instanceof vscode.Uri) 
            || !filepath.path.includes(fileExtensionWithOverrides)
        ) {
            return [];
        }

        var overrides: CSDesignPath[] = [];
        const addonsList = this.addonReader.getAddons();

        if (addonsList?.length > 0) {
            await Promise.all(
                addonsList.map(async addon => {
                    const override = await this.findOverrideInAddon(filepath, addon);
                    
                    if (override !== undefined) {
                        overrides.push(override);
                    }
                })
            );
        }

        return overrides;
    }

    async findOverrideInAddon(filepath: vscode.Uri, addon: string) : Promise<CSDesignPath | undefined> {
        const csWorkspaceFilePath = this.toCSDesignPath(filepath.path, addon);

        if (
            csWorkspaceFilePath.path.length < 1 
            || csWorkspaceFilePath.designPath.length < 1
        ) {
            return undefined;
        }

        const pathToSearch = path.join(this.workspaceRoot, csWorkspaceFilePath.designPath, 
            ADDON_CATALOG, addon, overridesPath, csWorkspaceFilePath.path);

        if (await afs.exists(pathToSearch)) {
            csWorkspaceFilePath.fullPath = pathToSearch;
            csWorkspaceFilePath.templatePath = path.join(
                this.workspaceRoot, 
                csWorkspaceFilePath.designPath,
                csWorkspaceFilePath.path
            );
            return csWorkspaceFilePath;
        }
        
        return undefined;
    }

    async findTemplateFilesInFolder(uri: vscode.Uri) : Promise<vscode.Uri[]> {
        var files: vscode.Uri[] = [];
        const children = await readDirectory(uri);

        if (children?.length > 0) {

            await Promise.all(
                children.map(async children => {

                    if (children[1] === vscode.FileType.Directory) {
                        files.concat(await this.findTemplateFilesInFolder(
                            vscode.Uri.file(
                                path.join(uri.fsPath, children[0])
                            )
                        ));

                    } else if (
                        children[1] === vscode.FileType.File
                        && children[0].toLowerCase().includes(fileExtensionWithOverrides)
                    ) {
                        files.push(vscode.Uri.file(
                            path.join(uri.fsPath, children[0])
                        ));
                    }
                })
            );
        }

        return files;
    }

    toCSDesignPath(filepath: string, addon: string): CSDesignPath {
        var csFilePath = '', designPath = '';
        var filePath = filepath.replace(this.workspaceRoot + '/', '');
        
        const sFilePath = filterOverridePathPart(filePath);
        const parts = sFilePath.split('/');

        if (parts.length >= 4) {
            if (
                parts[0] === DESIGN_CATALOG
            ) {
                if (parts[1] === DESIGN_BACKEND_CATALOG) {
                    
                    if (parts[2] === DESIGN_MAIL_CATALOG) {

                        if (
                            parts[3] === DESIGN_TEMPLATES_CATALOG
                            && parts?.[4]
                        ) {
                            csFilePath = parts.slice(4).join('/');
                            designPath = parts.slice(0, 4).join('/');
                        }

                    } else if (parts[2] === DESIGN_TEMPLATES_CATALOG) {
                        csFilePath = parts.slice(3).join('/');
                        designPath = parts.slice(0, 3).join('/');
                    }

                } else if (parts[1] === DESIGN_THEMES_CATALOG) {

                    if (parts[3] === DESIGN_MAIL_CATALOG && parts?.[4]) {

                        if (parts[4] === DESIGN_TEMPLATES_CATALOG && parts?.[5]) {
                            csFilePath = parts.slice(5).join('/');
                            designPath = parts.slice(0, 5).join('/');
                        }

                    } else if (parts[3] === DESIGN_TEMPLATES_CATALOG && parts?.[4]) {
                        csFilePath = parts.slice(4).join('/');
                        designPath = parts.slice(0, 4).join('/');
                    }
                }

            } else if (
                parts[0] === VAR_CATALOG 
                && parts[1] === VAR_THEMES_REPOSITORY_CATALOG
            ) {
                if (parts[3] === DESIGN_MAIL_CATALOG && parts?.[4]) {

                    if (parts[4] === DESIGN_TEMPLATES_CATALOG && parts?.[5]) {
                        csFilePath = parts.slice(5).join('/');
                        designPath = parts.slice(0, 5).join('/');
                    }

                } else if (parts[3] === DESIGN_TEMPLATES_CATALOG && parts?.[4]) {
                    csFilePath = parts.slice(4).join('/');
                    designPath = parts.slice(0, 4).join('/');
                }
            }
        }

        return {
            addon: addon,
            path: csFilePath,
            fullPath: '',
            templatePath: '',
            designPath: designPath
        };
    }
}

export function isOpenedFilesWithOverrides() {
    if (vscode.window.activeTextEditor) {
        if (vscode.window.activeTextEditor.document.uri.scheme === 'file') {
            const enabled = vscode.window.activeTextEditor.document
                .fileName.toLocaleLowerCase().includes(fileExtensionWithOverrides);
            vscode.commands.executeCommand('setContext', 'isMayBeCSOverrides', enabled);
        }
    }
}

export function filterOverridePathPart(path: string): string {
    const ovTemplate = new RegExp(
        "(" + DESIGN_TEMPLATES_CATALOG + "/" + ADDON_CATALOG + "/)[√\\w.]*(/" + overridesPath + "/)"
    );
    path = path.replace(
        ovTemplate, 
        DESIGN_TEMPLATES_CATALOG + '/'
    );

    return path;
}

export interface CSDesignPath {
    addon: string,
    path: string,
    fullPath: string, 
    templatePath: string, //original file fullpath
    designPath: string 
}
