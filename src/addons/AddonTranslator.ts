import * as vscode from 'vscode';
import { Addon } from "./AddonExplorer";
import { VAR_CATALOG, VAR_LANGS, VAR_LANG_FILE_EXTENSION, getTranslatesPath } from "./AddonFiles";
import { AddonPath } from "./AddonPath";
import * as afs from '../utility/afs';
import { LANGUAGE_CODE_LENGTH, languages } from "../utility/languages";
import { GetTextTranslation, GetTextTranslations, po } from "gettext-parser";

export class AddonTranslator {

    public langvars: Array<[string, LangVar]> = new Array<[string, LangVar]>();

    constructor(public workspaceRoot: string) {
	}

    public async translate(addon: Addon) {
		const addonTranslatesPath = await getTranslatesPath(this.workspaceRoot, addon.label);
        
        if (addonTranslatesPath?.length > 0) {
            await this.parseTranslateFiles(addonTranslatesPath);
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
            langvar_index--;
        }

        for (const data in langvar_data) {
            const _langvar_value_data: LangVarValue = { 
                lang_code: lang_code,
                value: langvar_data[data]?.msgstr ?? '',
                plural: langvar_data[data]?.msgid_plural ?? ''
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
    plural: string
}
