import * as vscode from 'vscode';
import * as path from 'path';
import { Addon } from "./AddonExplorer";
import { VAR_CATALOG, VAR_LANGS, VAR_LANG_FILE_EXTENSION, getTranslateFilePath, getTranslatesPath } from "./AddonFiles";
import { AddonPath } from "./AddonPath";
import * as afs from '../utility/afs';
import { BASE_LANGUAGE, DEFAULT_LANGUAGE, LANGUAGE_CODE_LENGTH, getLanguagePickerList, languages } from "../utility/languages";
import { GetTextComment, GetTextTranslation, GetTextTranslations, po } from "gettext-parser";

export class AddonTranslator {
    private selectedLanguages: string[] = [DEFAULT_LANGUAGE];
    private charset: Array<[string, string]> = new Array<[string, string]>();
    private langvars: Array<[string, LangVar]> = new Array<[string, LangVar]>();

    private headers: Array<[string, { [headerName: string]: string }]> 
        = new Array<[string, { [headerName: string]: string }]>();

    private _onDidSaveTranslateFiles: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidSaveTranslateFiles: vscode.Event<void> = this._onDidSaveTranslateFiles.event;

    constructor(public workspaceRoot: string, public addon: Addon) {
	}

    public async translate() {
        await this.getLanguagesPicker();
		const addonTranslatesPath = await getTranslatesPath(
            this.workspaceRoot, 
            this.addon.label
        );
        
        if (addonTranslatesPath?.length > 0) {
            await this.parseTranslateFiles(addonTranslatesPath);
        }
	}

    public async getLanguagesPicker() {
        const langPick = vscode.window.createQuickPick();
        langPick.canSelectMany = true;
        langPick.items = getLanguagePickerList(this.selectedLanguages);
        langPick.selectedItems = langPick.items.filter(item => item.picked);

        langPick.onDidChangeSelection(selection => {
            if (selection?.length > 0) {
                this.selectLanguages(selection);
            }
        });
        langPick.onDidAccept(async accepted => {
            langPick.hide();
            await this.translateLangVars();
            await this.save();
        });
        langPick.onDidHide(() => langPick.dispose());
        langPick.show();
    }

    public async selectLanguages(selected: readonly vscode.QuickPickItem[]) {
        this.selectedLanguages = [DEFAULT_LANGUAGE];
        selected.map(
            lang_code => {
                if (this.selectedLanguages.indexOf(lang_code.label) === -1) {
                    this.selectedLanguages.push(lang_code.label);
                }
            }
        );
    }

    protected async translateLangVars() {
        if (!this.selectedLanguages?.length) {
            return;
        }

        for (const sl of this.selectedLanguages) {
            await this.translateLangVarsForLanguage(sl);
        }
    }

    protected async translateLangVarsForLanguage(lang_code: string): Promise<void> {
        var toTranslate = this.langvars.filter(
            lv => {
                const index = lv[1].values.findIndex(v => {
                    return v.lang_code === lang_code;
                });
                const isExist = index >= 0;

                return !isExist;
            }
        );
        
        if (!toTranslate?.length) {
            return;
        }

        var isDefaultLanguage = lang_code === DEFAULT_LANGUAGE;
        var translatedStrings: string[] = [];
        var varsKeys: number[] = [];

        var key = 0;

        try {
            var translate = require("translate-google-fixed-api");

            for (var lv of toTranslate) {
                var valWithId = lv[1].values.find(v => {return v.id.trim();});

                if (valWithId) {
                    const _key = translatedStrings.indexOf(valWithId.id);

                    if (_key === -1) {
                        const result = await translate(valWithId.id, {
                            tld: "ru",
                            to: lang_code
                        });

                        if (result?.length > 0) {
                            const translated = result.join(' ');

                            lv[1].values = lv[1].values.map(
                                val => {
                                    val.id = translated;

                                    return val;
                                }
                            );

                            if (isDefaultLanguage) {
                                lv[1].values = lv[1].values.map(
                                    val => {
                                        val.id = result[_key];

                                        return val;
                                    }
                                );
                            }

                            var newValue: LangVarValue = {
                                lang_code: lang_code,
                                id: valWithId.id,
                                value: translated,
                                plural: '',
                                comments : undefined
                            };
                            
                            lv[1].values.push(newValue);
                        }

                        translatedStrings.push(valWithId.id);
                    }
                }
            }

        } catch (e) {
            
        }
    }

    public async save() {
        if (!this.selectedLanguages?.length) {
            return;
        }

        await Promise.all(
            this.selectedLanguages.map(
                async sl => {
                    var charset = this.charset.find(cs => cs[0] === sl)?.[1];
                    var header = this.headers.find(cs => cs[0] === sl)?.[1];

                    if (charset === undefined) {
                        charset = 'UTF-8';
                    }

                    if (header === undefined) {
                        header = this.getDefaultHeader(sl);
                    }

                    var langFile: GetTextTranslations = {
                        charset: charset,
                        headers: header,
                        translations: this.getTranslations(sl)
                    };

                    var buf = po.compile(langFile, {sort: function (a: GetTextTranslation, b: GetTextTranslation) {
                        if (!a?.msgctxt) {
                            return 1;
                        } else if (!b?.msgctxt) {
                            return -1;
                        }

                        if (a?.msgctxt.includes('Addons::')) {

                            if (a?.msgctxt.includes('name::')) {
                                return -1;
                            }
                            
                            if (b?.msgctxt.includes('Addons::')) {
                                return 0;
                            }

                            return -1;

                        } else if (b?.msgctxt.includes('Addons::')) {
                            return 1;
                        }
                        
                        if (a?.msgctxt.includes('SettingsSections::')) {
                            return b?.msgctxt.includes('SettingsSections::') ? 0 : -1;

                        } else if (b?.msgctxt.includes('SettingsSections::')) {
                            return 1;
                        }

                        if (a?.msgctxt.includes('SettingsOptions::')) {
                            return b?.msgctxt.includes('SettingsOptions::') ? 0 : -1;

                        } else if (b?.msgctxt.includes('SettingsOptions::')) {
                            return 1;
                        }

                        if (a?.msgctxt.includes('Languages::email_template')) {
                            return b?.msgctxt.includes('Languages::email_template') ? 0 : -1;

                        } else if (b?.msgctxt.includes('Languages::email_template')) {
                            return 1;
                        }

                        if (a?.msgctxt.includes('Languages::internal_template')) {
                            return b?.msgctxt.includes('Languages::internal_template') ? 0 : -1;

                        } else if (b?.msgctxt.includes('Languages::internal_template')) {
                            return 1;
                        }

                        return 0;
                    }});

                    const langFileName = getTranslateFilePath(this.workspaceRoot, this.addon.label, sl);
                    
                    if (langFileName) {

                        const dirname = path.dirname(langFileName);
                        const exists = await afs.exists(dirname);

                        if (!exists) {
                            await afs.mkdir(dirname);
                        }

                        await afs.writeFile(langFileName, buf);
                    }
                }
            )
        );

        this._onDidSaveTranslateFiles.fire();
    }

    async parseTranslateFiles(translatesPath: AddonPath[]) {
        const varLangs = VAR_CATALOG.concat('/', VAR_LANGS);
        await Promise.all(translatesPath.map(async path => {
                const isLangFile = path.path.includes(varLangs)
                    && path.path.endsWith(VAR_LANG_FILE_EXTENSION);
                
                if (isLangFile) {
                    await this.parseTranslateFile(path);
                }
            })
        );
    }

    async parseTranslateFile(translatesFilePath: AddonPath) {
        const lang_code = this.getLanguageCode(translatesFilePath);

        if (lang_code) {
            const data = await afs.readFile(translatesFilePath.path);

            if (data) {
                const parsed = po.parse(data);
                
                if (parsed) {
                    await this.setTranslationsData(parsed, lang_code);
                }
            }
        }
    }

    async setTranslationsData(data: GetTextTranslations, lang_code: string) {
        if (data.translations) {
            for (const langvar in data.translations) {
                if (langvar) {
                    const langvar_data = data.translations[langvar];

                    if (langvar_data !== undefined) {
                        await this.setLangvarData(langvar, langvar_data, lang_code);
                    }
                }
            }
        }

        if (data.charset) {
            this.charset.push([lang_code, data.charset]);
        }

        if (data.headers) {
            this.headers.push([lang_code, data.headers]);
        }
    }

    async setLangvarData(
        langvar: string, 
        langvar_data: { [msgId: string]: GetTextTranslation }, 
        lang_code: string
    ) {
        var langvar_index = this.findLangvarIndex(langvar);

        if (langvar_index === -1) {
            var _langvar_data: LangVar = { 
                id: langvar,
                values: []
            };
            
            langvar_index = this.langvars.push([langvar, _langvar_data]);
            langvar_index --;
        }

        for (const data in langvar_data) {
            const _langvar_value_data: LangVarValue = { 
                lang_code: lang_code,
                id: langvar_data[data].msgid ?? lang_code,
                value: langvar_data[data]?.msgstr ?? '',
                plural: langvar_data[data]?.msgid_plural ?? '',
                comments: langvar_data[data].comments
            };
            
            if (this.langvars[langvar_index]) {
                this.langvars[langvar_index][1].values.push(_langvar_value_data);
            }
        }
    }

    getLanguageCode(translatesFilePath: AddonPath) {
        const langs_path = VAR_LANGS + '/';
        const langs_pos = translatesFilePath.path.indexOf(langs_path);
        const lang_code_pos = langs_pos + langs_path.length;
        const lang_code = langs_pos === -1 ? '' : translatesFilePath.path.slice(
            lang_code_pos,
            lang_code_pos + LANGUAGE_CODE_LENGTH
        );

        var language = null;

        if (lang_code?.length === LANGUAGE_CODE_LENGTH) {
            language = languages.find(l => l.value === lang_code);
        }

        return language?.value ?? '';
    }

    private findLangvarIndex(langvar: string): number {
        return this.langvars.findIndex(
            _langvar => _langvar[0] === langvar
        );
    }

    private getDefaultHeader(lang_code: string) : { [headerName: string]: string } {
        const lang_obj = languages.find(l => l.value === lang_code);
        var header: { [headerName: string]: string } = {
            'Project-Id-Version': 'tygh',
            'Content-Type': 'text/plain; charset=UTF-8',
            'Language-Team': lang_obj?.name ?? 'English',
            'Language': lang_obj?.code ?? 'en_US'
        };

        return header;
    }

    private getTranslations(lang_code: string) : { [msgctxt: string]: { [msgId: string]: GetTextTranslation } } {
        var translations: { [msgctxt: string]: { [msgId: string]: GetTextTranslation } } = {

        };
        
        this.langvars.map(
            langvar => {
                var _langvar = langvar[1].values.find(vl => {return vl.lang_code === lang_code;});
                var default_langvar = langvar[1].values.find(vl => {return vl.lang_code === DEFAULT_LANGUAGE;});

                if (_langvar === undefined && default_langvar === undefined) {
                    default_langvar = langvar[1].values.find(vl => {return vl.lang_code === BASE_LANGUAGE;});

                    if (default_langvar === undefined) {
                        default_langvar = langvar[1].values.find(vl => {return vl.lang_code?.length > 0;});

                        if (default_langvar === undefined) {
                            return;
                        }
                    }

                    _langvar = default_langvar;

                } else if (_langvar === undefined && default_langvar !== undefined) {
                    _langvar = default_langvar;
                    _langvar.value = [default_langvar.id];
                } else if (default_langvar === undefined && _langvar !== undefined ) {
                    default_langvar = _langvar;
                    default_langvar.value = [_langvar.id];
                }

                if (_langvar === undefined && default_langvar === undefined) {
                    return;
                }
                
                var val = _langvar?.value;
                var _id = default_langvar?.id ?? default_langvar?.value?.[0];

                if (val === undefined && _id !== undefined) {
                    val = [_id];
                }

                if (_id === undefined || val === undefined) {
                    return;
                }

                var translation: GetTextTranslation = {
                    msgid: _id,
                    msgctxt: langvar[0],
                    msgstr: val,
                    msgid_plural: _langvar?.plural,
                    comments: _langvar?.comments
                };

                translations[langvar[0]] = {_id: translation};
            }
        );

        return translations;
    }
}

interface LangVar {
    id: string;
    values: LangVarValue[]
}

interface LangVarValue {
    lang_code: string;
    id: string,
    value: string[],
    plural: string,
    comments: GetTextComment | undefined
}
