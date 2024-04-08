import * as vscode from 'vscode';
import * as path from 'path';
import { Addon } from "./AddonExplorer";
import { VAR_CATALOG, VAR_LANGS, VAR_LANG_FILE_EXTENSION, getTranslateFilePath, getTranslatesPath } from "./AddonFiles";
import { AddonPath } from "./AddonPath";
import * as afs from '../utility/afs';
import { BASE_LANGUAGE, DEFAULT_LANGUAGE, LANGUAGE_CODE_LENGTH, getLanguagePickerList, languages } from "../utility/languages";
import { GetTextComment, GetTextTranslation, GetTextTranslations, po } from "gettext-parser";
import { AddonReader } from './AddonReader';
import { LangVarsFinder } from './LangVarsFinder';

export class AddonTranslator {
    private parsedSelectedLanguages: string[] = [];
    private selectedLanguages: string[] = [DEFAULT_LANGUAGE];
    private charset: Array<[string, string]> = new Array<[string, string]>();
    private langvars: Array<[string, LangVar]> = new Array<[string, LangVar]>();

    private headers: Array<[string, { [headerName: string]: string }]> 
        = new Array<[string, { [headerName: string]: string }]>();

    private _onDidSaveTranslateFiles: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidSaveTranslateFiles: vscode.Event<void> = this._onDidSaveTranslateFiles.event;

    constructor(private addonReader: AddonReader, public addon: Addon) {
	}

    public async normalize() {
		this.init(false);
	}

    public async translate() {
		this.init(true);
	}

    public async init(needTranslate: boolean) {
        const addonTranslatesPath = await getTranslatesPath(
            this.addonReader.workspaceRoot, 
            this.addon.label
        );
        
        if (addonTranslatesPath?.length > 0) {
            await this.parseTranslateFiles(addonTranslatesPath);
        }

        await this.getLanguagesPicker(needTranslate);
    }

    public async getLanguagesPicker(needTranslate: boolean) {
        const langPick = vscode.window.createQuickPick();
        langPick.canSelectMany = true;
        langPick.items = getLanguagePickerList(this.getDefaultSelectedSet());
        langPick.selectedItems = langPick.items.filter(item => item.picked);

        langPick.onDidChangeSelection(selection => {
            if (selection?.length > 0) {
                this.selectLanguages(selection);
            }
        });
        
        langPick.onDidAccept(async accepted => {
            langPick.hide();

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t("Translating addon"),
                cancellable: false
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                   
                });
    
                progress.report({ increment: 0 });
                
                progress.report({ increment: 10, message: vscode.l10n.t("Search Langvars in addon files...") });

                const langVarsFinder = new LangVarsFinder(this.addonReader, this.addon.label);
                const findedLangVars = await langVarsFinder.findLangVarsInAddonFiles();

                if (findedLangVars?.length > 0) {
                    this.addLangVars(findedLangVars);
                }

                progress.report({ increment: 20, message: vscode.l10n.t("Normalization of lang vars...") });

                await this.normalizeLangVars();

                if (needTranslate) {
                    progress.report({ increment: 30, message: vscode.l10n.t("Translating lang vars...") });
                    await this.translateLangVars();
                }
    
                progress.report({ increment: 40, message: vscode.l10n.t("Saving translation files...") });

                await this.save();
    
                const p = new Promise<void>(resolve => {
                    resolve();
                });
    
                return p;
            });  
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

    protected getDefaultSelectedSet(): string[] {
        var set: string[] = [DEFAULT_LANGUAGE];

        if (this.parsedSelectedLanguages.length > 0) {
            this.parsedSelectedLanguages.map(sl => {
                set.push(sl);
            });
        }

        return set;
    }

    protected async normalizeLangVars() {
        if (!this.langvars?.length) {
            return;
        }

        this.langvars = this.langvars.map(
            lv => {
                if (lv[1].values.length > 0) {
                    var commonId: string = '';

                    for (const lvv of lv[1].values) {
                        var existId = lvv.id.trim()?.length > 0;

                        if (existId) {
                            commonId = lvv.id;

                            if (lvv.lang_code === DEFAULT_LANGUAGE) {
                                break;
                            }
                        } 
                    }

                    const existCommonId = commonId.trim()?.length > 0;

                    lv[1].values = lv[1].values.map(
                        lvv => {
                            var existId = lvv.id.trim()?.length > 0;
                            const existVal = lvv.value.findIndex(
                                v => {return v.trim()?.length > 0;}
                            ) > -1;

                            if (existId && !existVal) {
                                lvv.value = [lvv.id];
                                
                            } else if (!existId) {

                                if (existCommonId) {
                                    lvv.id = commonId;
                                } else if (existVal) {
                                    lvv.id = lvv.value[0];
                                }

                                existId = true;
                            }

                            return lvv;
                        }
                    );
                }

                return lv;
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

                            if (isDefaultLanguage && translated.trim()) {
                                lv[1].values = lv[1].values.map(
                                    val => {
                                        val.id = translated;

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

                    const langFileName = getTranslateFilePath(this.addonReader.workspaceRoot, this.addon.label, sl);
                    
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
        this.parsedSelectedLanguages = [];
        const varLangs = VAR_CATALOG.concat('/', VAR_LANGS);
        await Promise.all(
            translatesPath.map(async path => {
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

            this.parsedSelectedLanguages.push(lang_code);
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

    private addLangVars(langVars: string[]) {
        langVars.map(langVarId => {
            const langVarContext = "Languages::" + langVarId;
            const isExist = this.langvars.findIndex(lv => {
                return lv[0] === langVarContext;
            });

            if (isExist === -1) {
                this.langvars.push([langVarContext, {
                    id: langVarContext,
                    values: [
                        {
                            lang_code: DEFAULT_LANGUAGE,
                            id: '',
                            value: [],
                            plural: '',
                            comments: undefined
                        }
                    ]
                }]);   
            }
        });
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
