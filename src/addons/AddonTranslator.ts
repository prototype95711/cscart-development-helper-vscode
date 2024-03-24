import * as vscode from 'vscode';
import { Addon } from "./AddonExplorer";
import { VAR_CATALOG, VAR_LANGS, VAR_LANG_FILE_EXTENSION, getTranslatesPath } from "./AddonFiles";
import { AddonPath } from "./AddonPath";
import * as afs from '../utility/afs';
import { DEFAULT_LANGUAGE, LANGUAGE_CODE_LENGTH, getLanguagePickerList, languages } from "../utility/languages";
import { GetTextComment, GetTextTranslation, GetTextTranslations, po } from "gettext-parser";

export class AddonTranslator {
    private selectedLanguages: string[] = [DEFAULT_LANGUAGE];
    private charset: Array<[string, string]> = new Array<[string, string]>();
    private langvars: Array<[string, LangVar]> = new Array<[string, LangVar]>();

    private headers: Array<[string, { [headerName: string]: string }]> 
        = new Array<[string, { [headerName: string]: string }]>();

    constructor(public workspaceRoot: string, public addon: Addon) {
	}

    public async translate() {
        await this.selectLanguages();
		const addonTranslatesPath = await getTranslatesPath(
            this.workspaceRoot, 
            this.addon.label
        );
        
        if (addonTranslatesPath?.length > 0) {
            await this.parseTranslateFiles(addonTranslatesPath);
        }
	}

    public async selectLanguages() {
        const langPick = vscode.window.createQuickPick();
        langPick.canSelectMany = true;
        langPick.items = getLanguagePickerList(this.selectedLanguages);
        langPick.selectedItems = langPick.items.filter(item => item.picked);

        langPick.onDidChangeSelection(selection => {
            if (selection) {
                this.selectLanguage(selection);
            }
        });
        langPick.onDidAccept(accepted => {
            langPick.hide();
        });
        langPick.onDidHide(() => langPick.dispose());
        langPick.show();
    }

    public async selectLanguage(selected: readonly vscode.QuickPickItem[]) {
        this.selectedLanguages = [DEFAULT_LANGUAGE];
        selected.map(
            lang_code => {
                if (this.selectedLanguages.indexOf(lang_code.label) === -1) {
                    this.selectedLanguages.push(lang_code.label);
                }
            }
        );
    }

    public async save() {
        if (this.langvars.length > 0) {
            
        }
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
}

interface LangVar {
    id: string;
    values: LangVarValue[]
}

interface LangVarValue {
    lang_code: string;
    value: string[],
    plural: string,
    comments: GetTextComment | undefined
}
