import * as vscode from 'vscode';
import { IPatternInfo, ISearchRange, ITextSearchMatch, getFileResults, resultIsMatch } from '../search/searchInFiles';
import { readDirectory } from '../utility/afs';
import { createRegExp } from '../utility/strings';
import { AddonReader } from './AddonReader';
import * as afs from '../utility/afs';
import path from 'path';

const fileExtensionsWithLangvars = ['.php', '.tpl', '.js', '.xml'];

export class LangVarsFinder {

    private langVars: string[] = [];

    constructor(public addonReader: AddonReader, private addon: string) {

    }

    public async findLangVarsInAddonFiles() : Promise<string[]> {
        const addonPathes = await this.addonReader.getAddonPathes(
            this.addon,
            -2,
            '',
            {skipTranslatesPath: true}
        );

        if (addonPathes.length > 0) {
            await Promise.all(
                addonPathes.map(async el_path => {
                    await this.findLangVarsInFolder(vscode.Uri.file(el_path.path));
                })
            );
        }

        return this.langVars;
    }

    async findLangVarsInFolder(uri: vscode.Uri) {
        const children = await readDirectory(uri);

        if (children?.length > 0) {

            await Promise.all(
                children.map(async children => {

                    if (children[1] === vscode.FileType.Directory) {
                        await this.findLangVarsInFolder(vscode.Uri.file(
                            path.join(uri.fsPath, children[0])
                        ));

                    } else if (children[1] === vscode.FileType.File) {

                        const exIndex = fileExtensionsWithLangvars.findIndex(
                            ex => {
                                return uri.fsPath.toLowerCase().includes(ex);
                            }
                        );

                        if (exIndex > -1) {
                            await this.findLangVarsInFile(path.join(uri.fsPath, children[0]));
                        }
                    }
                })
            );
        }
    }

    async findLangVarsInFile(uri: string) {
        const fileData = await afs.readFile(uri);

        if (!fileData) {
            return;
        }
        const regExp = '[_][(][\'"]' + this.addon + '[√\\w.]*[\'"]';
        const options: IPatternInfo = {
            pattern: regExp,
            isRegExp: true
        }; 
        const pattern = createSearchRegExp(options);

        const fileResults = getFileResults(fileData, pattern, {
            afterContext: 0,
            beforeContext: 0,
            previewOptions: undefined,
            remainingResultQuota: 10000
        });

        if (fileResults?.length > 0) {
            fileResults.map(result => {
                if (resultIsMatch(result)) {
                    this.parseResult(result);
                }
            });
        }
    }
    
    parseResult(result: ITextSearchMatch) {
        if (result.preview.text.length > 0) {

            if (Array.isArray(result.preview.matches)) {
                result.preview.matches.map(match => {
                    this.parseResultText(
                        result.preview.text,
                        match
                    );
                });
            } else {
                this.parseResultText(
                    result.preview.text,
                    result.preview.matches
                );
            }
        }
    }

    parseResultText(text: string, matches: ISearchRange) {
        const langVarText = text.slice(
            matches.startColumn,
            matches.endColumn
        );
        
        if (langVarText.trim()) {

            var langVarName = '';
            
            if (langVarText.includes('"')) {
                langVarName = langVarText.split('"')?.[1];
            } else if (langVarText.includes('\'')) {
                langVarName = langVarText.split('\'')?.[1];
            }

            if (langVarName.trim() && !this.langVars.includes(langVarName)) {
                this.langVars.push(langVarName);
            }
        }
    }
}

export function createSearchRegExp(options: IPatternInfo): RegExp {
    return createRegExp(options.pattern, !!options.isRegExp, {
        wholeWord: options.isWordMatch,
        global: true,
        matchCase: options.isCaseSensitive,
        multiline: true,
        unicode: true,
    });
}
