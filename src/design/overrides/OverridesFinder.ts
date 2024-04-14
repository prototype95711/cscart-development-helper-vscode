import * as vscode from 'vscode';
import * as afs from '../../utility/afs';

import { AddonReader } from '../../addons/AddonReader';
import { ADDON_CATALOG, DESIGN_BACKEND_CATALOG, DESIGN_CATALOG, DESIGN_MAIL_CATALOG, DESIGN_PARTS, DESIGN_TEMPLATES_CATALOG, DESIGN_THEMES_CATALOG, VAR_CATALOG, VAR_THEMES_REPOSITORY_CATALOG, getAddonDesignPathes, getThemeNames } from '../../addons/files/AddonFiles';
import { readDirectory } from '../../utility/afs';
import path from 'path';

const fileExtensionWithOverrides = '.tpl';
const overridesPath = 'overrides';

export const designThemesCatalog = path.join(DESIGN_CATALOG, DESIGN_THEMES_CATALOG);
export const varThemeRepCatalog = path.join(VAR_CATALOG, VAR_THEMES_REPOSITORY_CATALOG);

const THEME_FOLDER_PLACEHOLDER = '$themeFolder$';

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
            const csDesignPath = toCSDesignPath(filepath.path, '', this.workspaceRoot);

            await Promise.all(
                addonsList.map(async addon => {
                    const addonOverrides = await this.findOverridesInAddon(
                        csDesignPath, 
                        addon
                    );
                    
                    if (addonOverrides?.length > 0) {
                        addonOverrides.map(ov => {
                            ov.addon = addon;
                            overrides.push(ov);
                        });
                    }
                })
            );
        }

        return overrides;
    }

    async findOverridesInAddon(csDesignPath: CSDesignPath, addon: string) : Promise<Array<CSDesignPath>> {
        var result : Array<CSDesignPath> = [];

        if (
            csDesignPath.path.length < 1 
            || csDesignPath.designPath.length < 1
        ) {
            return result;
        }

        const designPath = csDesignPath.designPath;
        const pathToSearch = path.join(this.workspaceRoot, designPath, 
            ADDON_CATALOG, addon, overridesPath, csDesignPath.path);

        if (pathToSearch.includes(
                designThemesCatalog
            )
            || pathToSearch.includes(
                varThemeRepCatalog
            )
        ) {
            result = await this.findOverridesInThemes(
                {
                    addon: addon,
                    path: csDesignPath.path,
                    fullPath: pathToSearch, 
                    templatePath: path.join(
                        this.workspaceRoot, 
                        csDesignPath.designPath,
                        csDesignPath.path
                    ), //original file fullpath
                    designPath: designPath,
                    theme: csDesignPath?.theme
                },
                addon,
                result
            );
            
        } else {
            if (await afs.exists(pathToSearch)) {
                result.push({
                    addon: addon,
                    path: csDesignPath.path,
                    fullPath: pathToSearch, 
                    templatePath: path.join(
                        this.workspaceRoot, 
                        csDesignPath.designPath,
                        csDesignPath.path
                    ), //original file fullpath
                    designPath: designPath,
                    theme: csDesignPath?.theme
                });
    
            } else {
                const rDesignPath = csDesignPath.designPath.includes(varThemeRepCatalog) 
                    ? csDesignPath.designPath.replace(
                        varThemeRepCatalog,
                        designThemesCatalog
                    ) 
                    : csDesignPath.designPath.replace(
                        designThemesCatalog,
                        varThemeRepCatalog
                    );
                const rPathToSearch = path.join(this.workspaceRoot, rDesignPath, 
                    ADDON_CATALOG, addon, overridesPath, csDesignPath.path);
    
                if (await afs.exists(rPathToSearch)) {
                    result.push({
                        addon: addon,
                        path: csDesignPath.path,
                        fullPath: rPathToSearch, 
                        templatePath: path.join(
                            this.workspaceRoot, 
                            rDesignPath,
                            csDesignPath.path
                        ), //original file fullpath
                        designPath: rDesignPath,
                        theme: csDesignPath?.theme
                    });
                }
            }
        }

        if (result.length > 0) {
            result = await this.findOverridesInAltCatalog(
                addon,
                result
            );
        }
        
        return result;
    }

    async findOverridesInAltCatalog(
        addon: string, 
        result: CSDesignPath[]
    ) : Promise<Array<CSDesignPath>> {
        
        if (result.length > 0) {
            await Promise.all(
                result.map(
                    async tFile => {
                        const cResult = await this.findOverrideInAltCatalog(
                            tFile,
                            addon
                        );
    
                        if (cResult !== undefined) {
                            result.push(cResult);
                        }
                    }
                )
            );
        }

        return result;
    }

    async findOverrideInAltCatalog(
        csDesignPath: CSDesignPath, 
        addon: string
    ) : Promise<CSDesignPath | undefined>
    {
        const isInVarThemes = csDesignPath.fullPath.includes(
            varThemeRepCatalog
        );

        if (
            isInVarThemes
            || csDesignPath.fullPath.includes(designThemesCatalog)
        ) {
            const rDesignPath = isInVarThemes 
                ? csDesignPath.designPath.replace(
                    varThemeRepCatalog,
                    designThemesCatalog
                ) 
                : csDesignPath.designPath.replace(
                    designThemesCatalog,
                    varThemeRepCatalog
                );
                
            const rPathToSearch = path.join(this.workspaceRoot, rDesignPath, 
                ADDON_CATALOG, addon, overridesPath, csDesignPath.path);

            if (await afs.exists(rPathToSearch)) {
                const rCSDesignPath: CSDesignPath = {
                    addon: addon,
                    path: csDesignPath.path,
                    fullPath: rPathToSearch, 
                    templatePath: path.join(
                        this.workspaceRoot, 
                        rDesignPath,
                        csDesignPath.path
                    ), //original file fullpath
                    designPath: rDesignPath,
                    theme: csDesignPath.theme
                };

                return rCSDesignPath;
            }
        }

        return undefined;
    }

    async findOverridesInThemes(
        csDesignPath: CSDesignPath, 
        addon: string, 
        result: CSDesignPath[]
    ) : Promise<Array<CSDesignPath>> {
        const isInDesignTheme = csDesignPath.fullPath.includes(
            designThemesCatalog
        );

        if (csDesignPath.theme) {
            const tDesignPath = csDesignPath.designPath.replace(
                csDesignPath.theme,
                THEME_FOLDER_PLACEHOLDER
            );
            
            var themeNames = isInDesignTheme 
                ? await getThemeNames(path.join(this.workspaceRoot, designThemesCatalog))
                : await getThemeNames(path.join(this.workspaceRoot, varThemeRepCatalog));

            if (themeNames.length > 0) {
                await Promise.all(themeNames.map(async themeName => {
                    const tResult = await this.findOverridesInTheme(
                        csDesignPath,
                        addon,
                        tDesignPath,
                        themeName
                    );

                    if (tResult !== undefined) {
                        result.push(tResult);
                    } else {
                        const rDesignPath = isInDesignTheme 
                            ? tDesignPath.replace(
                                designThemesCatalog,
                                varThemeRepCatalog
                            )
                            : tDesignPath.replace(
                                varThemeRepCatalog,
                                designThemesCatalog
                            );

                        const tResult = await this.findOverridesInTheme(
                            csDesignPath,
                            addon,
                            rDesignPath,
                            themeName
                        );

                        if (tResult !== undefined) {
                            result.push(tResult);
                        }
                    }
                }));
            }
        }

        return result;
    }

    async findOverridesInTheme(
        csDesignPath: CSDesignPath, 
        addon: string, 
        tDesignPath: string, 
        theme: string
    ) : Promise<CSDesignPath | undefined> 
    {
        const _tDesignPath = tDesignPath.replace(
            THEME_FOLDER_PLACEHOLDER,
            theme
        );

        const rPathToSearch = path.join(this.workspaceRoot, _tDesignPath, 
            ADDON_CATALOG, addon, overridesPath, csDesignPath.path);

        if (await afs.exists(rPathToSearch)) {
            const rCSDesignPath: CSDesignPath = {
                addon: addon,
                path: csDesignPath.path,
                fullPath: rPathToSearch, 
                templatePath: path.join(
                    this.workspaceRoot, 
                    _tDesignPath,
                    csDesignPath.path
                ), //original file fullpath
                designPath: _tDesignPath,
                theme: csDesignPath.theme
            };

            return rCSDesignPath;
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
}

export function isOpenedFilesWithOverrides(): boolean {
    if (vscode.window.activeTextEditor) {
        if (vscode.window.activeTextEditor.document.uri.scheme === 'file') {
            const enabled = vscode.window.activeTextEditor.document
                .fileName.toLocaleLowerCase().includes(fileExtensionWithOverrides);
            vscode.commands.executeCommand('setContext', 'isMayBeCSOverrides', enabled);

            return enabled;
        }
    }

    return false;
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

export function toCSDesignPath(filepath: string, addon: string, workspaceRoot: string): CSDesignPath {
    var csFilePath = '', designPath = '';
    var filePath = filepath.replace(workspaceRoot + '/', '');
    
    const sFilePath = filterOverridePathPart(filePath);
    const parts = sFilePath.split('/');
    var theme = '';

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

                theme = parts[2];
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

            theme = parts[2];
        }
    }

    return {
        addon: addon,
        path: csFilePath,
        fullPath: '',
        templatePath: '',
        designPath: designPath,
        theme: theme
    };
}

export interface CSDesignPath {
    addon: string,
    path: string,
    fullPath: string, 
    templatePath: string, //original file fullpath
    designPath: string,
    theme?: string
}
