import * as vscode from 'vscode';
import { IPatternInfo, ISearchRange, ITextSearchMatch, getFileResults, resultIsMatch } from '../../search/searchInFiles';
import { readDirectory } from '../../utility/afs';
import { createRegExp } from '../../utility/strings';
import { AddonReader } from '../AddonReader';
import * as afs from '../../utility/afs';
import path from 'path';

const { parseString } = require('xml2js');
const fileExtensionsWithLangvars = ['.php', '.tpl', '.js', '.xml'];
const DOCUMENT_XML_INVALID_ERROR = "{addon}: {filepath} document is invalid???";

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
            var is_block_manager_scheme = false, is_menu_scheme = false;

            if (uri.path.includes('/schemas/block_manager')) {
                is_block_manager_scheme = true;
            } else if (uri.path.includes('/schemas/menu')) {
                is_menu_scheme = true;
            }

            await Promise.all(
                children.map(async children => {

                    if (children[1] === vscode.FileType.Directory) {
                        await this.findLangVarsInFolder(vscode.Uri.file(
                            path.join(uri.fsPath, children[0])
                        ));

                    } else if (children[1] === vscode.FileType.File) {
                        const exIndex = fileExtensionsWithLangvars.findIndex(
                            ex => {
                                return children[0].includes(ex);
                            }
                        );

                        if (exIndex > -1) {
                            var fileUrl = path.join(uri.fsPath, children[0]), is_xml = fileUrl.includes('.xml');

                            await this.findLangVarsInFile(
                                path.join(uri.fsPath, children[0]), 
                                {isBlockManagerSchema: is_block_manager_scheme, isMenuSheme: is_menu_scheme, isXml: is_xml}
                            );
                        }
                    }
                })
            );
        }
    }

    async findLangVarsInFile(uri: string, options: any = {}) {
        const fileData = await afs.readFile(uri);

        if (!fileData) {
            return;
        }
        const regExp = '(_)[(][\'"]' + this.addon + '[√\\w.]*[\'"]';
        
        await this.findResultsInFileByPattern(fileData, regExp);

        if (uri.includes('.tpl')) {
            const regExpBd = '\\{\\*\\*[\\s{0,}]block-description\:[√\\w.]*[\\s{0,}]\\*\\*\\}';
            await this.findResultsInFileByPattern(fileData, regExpBd, true);
        }

        if (options?.isBlockManagerSchema) {
            const regExpBm = 'schema\\[[\'"]' + this.addon + '[√\\w.]*[\'"]';
            await this.findResultsInFileByPattern(fileData, regExpBm, true, 'block_', ['', '_description']);

        } else if (options?.isMenuSheme) {
            const regExpMm = '\\[[\'"]' + this.addon + '[√\\w.]*[\'"]\\]';
            await this.findResultsInFileByPattern(fileData, regExpMm, true, '', ['', '_menu_description']);

            const regExpMm2 = '[\'"]' + this.addon + '[√\\w.]*[\'"][\\s{0,}]=>';
            await this.findResultsInFileByPattern(fileData, regExpMm2, true, '', ['', '_menu_description']);

        } else if (options?.isXml) {
            var isEmailTemplates = fileData.includes('<email_templates'), isInternalTemplates = fileData.includes('<internal_templates'),
                isDocumentTemplates = fileData.includes('<documents');
            
            if (isEmailTemplates || isInternalTemplates || isDocumentTemplates) {
                var fileJson = '';
                const reading = (err: any, result: any) => {
                    if (err || !result) {
                        vscode.window.showWarningMessage(DOCUMENT_XML_INVALID_ERROR.replace("{addon}", this.addon).replace("{filepath}", uri));
                    } else {
                        fileJson = JSON.stringify(result);
                    }
                };
                
                parseString(
                    fileData,
                    reading
                );
        
                const jsonFileData = JSON.parse(fileJson);

                if (jsonFileData?.email_templates?.templates?.[0]?.item) {
                    jsonFileData?.email_templates?.templates?.[0]?.item.forEach((template: any) => {
                        if (template?.addon?.[0] === this.addon && template?.code?.[0]) {
                            this.langVars.push('email_template.'.concat(template.code[0])); 
                        }
                    });
                }

                if (jsonFileData?.internal_templates?.templates?.[0]?.item) {
                    jsonFileData?.internal_templates?.templates?.[0]?.item.forEach((template: any) => {
                        if (template?.addon?.[0] === this.addon && template?.code?.[0]) {
                            this.langVars.push('internal_template.'.concat(template.code[0])); 
                        }
                    });
                }

                if (jsonFileData?.documents?.document) {
                    jsonFileData?.documents?.document.forEach((document: any) => {
                        if (document?.addon?.[0] === this.addon && document?.code?.[0] && document?.type?.[0]) {
                            this.langVars.push('template_document_'.concat(document.type[0]).concat('_').concat(document.code[0])); 
                        }
                    });
                }
            }
        }
    }

    async findResultsInFileByPattern(fileData: Buffer, regExp: string, isRegExp: boolean = true, prefix: Array<string>|string = '', postfix: Array<string>|string = '') {
        const pOptions: IPatternInfo = {
            pattern: regExp,
            isRegExp: true
        }; 
        const pattern = createSearchRegExp(pOptions);

        const fileResults = getFileResults(fileData, pattern, {
            afterContext: 0,
            beforeContext: 0,
            previewOptions: undefined,
            remainingResultQuota: 10000
        });

        if (fileResults?.length > 0) {
            fileResults.map(result => {
                if (resultIsMatch(result)) {
                    this.parseResult(result, prefix, postfix);
                }
            });
        }
    }
    
    parseResult(result: ITextSearchMatch, prefix: Array<string>|string = '', postfix: Array<string>|string = '') {
        if (result.preview.text.length > 0) {

            if (Array.isArray(result.preview.matches)) {
                result.preview.matches.map(match => {
                    this.parseResultText(
                        result.preview.text,
                        match,
                        prefix,
                        postfix
                    );
                });
            } else {
                this.parseResultText(
                    result.preview.text,
                    result.preview.matches,
                    prefix,
                    postfix
                );
            }
        }
    }

    parseResultText(text: string, matches: ISearchRange, prefix: Array<string>|string = '', postfix: Array<string>|string = '') {
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
            } else if (langVarText.includes('block-description:')) {
                langVarName = langVarText.split('block-description:')?.[1].replace('**}', '').trim();
            } else if (langVarText.includes('<code>')) {
                langVarName = langVarText.replace('<code><![CDATA[', '').replace(']]></code>', '').trim();
            } else {
                langVarName = langVarText.trim();
            }

            if (langVarName.trim() && !this.langVars.includes(langVarName)) {

                if (Array.isArray(prefix) && prefix?.length > 0) {
                    var pindex = 0;
                    prefix.map(p => {
                        var pf = Array.isArray(postfix) ? (postfix[pindex] ?? '') : postfix;
                        this.langVars.push(p.concat(langVarName).concat(pf)); 
                        pindex++;
                    });

                } else if (Array.isArray(postfix) && postfix?.length > 0) {
                    var pr = prefix = Array.isArray(prefix) ? '' : prefix;
                    postfix.map(p => {
                        this.langVars.push(pr.concat(langVarName).concat(p)); 
                    });
                } else {
                    prefix = Array.isArray(prefix) ? '' : prefix;
                    postfix = Array.isArray(postfix) ? '' : postfix;
                    this.langVars.push(prefix.concat(langVarName).concat(postfix));
                }
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
