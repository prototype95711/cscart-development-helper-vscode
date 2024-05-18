import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AddonPath, pathExists } from './AddonPath';

export const APP_CATALOG = 'app';
export const ADDON_CATALOG = 'addons';
export const ADDON_XML_FILENAME = 'addon.xml';

export const DESIGN_CATALOG = 'design';
export const DESIGN_BACKEND_CATALOG = 'backend';
export const DESIGN_THEMES_CATALOG = 'themes';

export const DESIGN_MAIL_CATALOG = 'mail';
export const DESIGN_CSS_CATALOG = 'css';
export const DESIGN_TEMPLATES_CATALOG = 'templates';

export const DESIGN_PARTS = [
	'css',
	DESIGN_MAIL_CATALOG + '/' + DESIGN_TEMPLATES_CATALOG,
	'media/images',
	DESIGN_TEMPLATES_CATALOG
];
export const DESIGN_THEME_MANIFEST_FILENAME = 'manifest.json';

export const JS_CATALOG = 'js';

export const VAR_CATALOG = 'var';
export const VAR_LANGS = 'langs';

export const VAR_LANG_FILE_EXTENSION = '.po';

export const VAR_THEMES_REPOSITORY_CATALOG = 'themes_repository';

export function getAddonsPath(workspaceRoot: string | undefined) {

	if (!workspaceRoot) {
		return '';
	}

	return path.join(workspaceRoot, APP_CATALOG, ADDON_CATALOG);
}

export async function getAddonPath(addonsPath: string | undefined, addon: string) {

	if (!addonsPath) {
		return null;
	}

	return new AddonPath(path.join(addonsPath, addon), vscode.FileType.Directory);
}

export function getAddonXmlPath(addonsPath: string | undefined, addon: string) {

	const _addonPath = new AddonPath(
		'',
		vscode.FileType.File
	);

	if (addonsPath) {
		_addonPath.path = path.join(addonsPath, addon, ADDON_XML_FILENAME);
	}

	return _addonPath;
}

export async function getAddonDesignPathes(workspaceRoot: string | undefined, addon: string) {

	if (!workspaceRoot) {
		return [];
	}

	const designPath = path.join(workspaceRoot, DESIGN_CATALOG);
	const designBackendPathes = DESIGN_PARTS.map(
		part => 
			new AddonPath(
				path.join(designPath, DESIGN_BACKEND_CATALOG, part, ADDON_CATALOG, addon),
				vscode.FileType.Directory
			)
	);
	
	const designThemesAddonPathes: AddonPath[] = [];
	const designThemesPathes = path.join(designPath, DESIGN_THEMES_CATALOG);
	const themeNames = await getThemeNames(designThemesPathes);

	if (themeNames) {
		themeNames.forEach(
			themePath => DESIGN_PARTS.map(
				part => designThemesAddonPathes.push(
					new AddonPath(
						path.join(designThemesPathes, themePath, part, ADDON_CATALOG, addon),
						vscode.FileType.Directory
					)
				)
			)
		);	
	}

	const repThemesAddonPathes: AddonPath[] = [];
	const repositoryThemesPathes = path.join(workspaceRoot, VAR_CATALOG, VAR_THEMES_REPOSITORY_CATALOG);
	const repThemeNames = await getThemeNames(repositoryThemesPathes);

	if (themeNames) {
		repThemeNames.forEach(
			themePath => DESIGN_PARTS.map(
				part => repThemesAddonPathes.push(
					new AddonPath(
						path.join(repositoryThemesPathes, themePath, part, ADDON_CATALOG, addon),
						vscode.FileType.Directory
					)
				)
			)
		);	
	}
	
	return designBackendPathes.concat(designThemesAddonPathes, repThemesAddonPathes);
}

export async function getAddonJsPath(workspaceRoot: string | undefined, addon: string) {

	if (!workspaceRoot) {
		return null;
	}

	return new AddonPath(path.join(workspaceRoot, JS_CATALOG, ADDON_CATALOG, addon), vscode.FileType.Directory);
}

export function getTranslateFilePath(workspaceRoot: string | undefined, addon: string, langCode: string): string {

	if (!workspaceRoot) {
		return '';
	}

	const addonLangFile = addon.concat(VAR_LANG_FILE_EXTENSION);
	const langFilePath = path.join(
		workspaceRoot, 
		VAR_CATALOG, 
		VAR_LANGS, 
		langCode,
		ADDON_CATALOG,
		addonLangFile
	);
	
	return langFilePath;
}

export async function getTranslatesPath(workspaceRoot: string | undefined, addon: string) {

	if (!workspaceRoot) {
		return [];
	}

	const langsPath = path.join(workspaceRoot, VAR_CATALOG, VAR_LANGS);
	const addonLangFile = addon.concat(VAR_LANG_FILE_EXTENSION);

	const getLangsNames = (langsPath:string) =>
		fs.readdirSync(langsPath, { withFileTypes: true })
		.filter(dirent => dirent.isDirectory())
		.map(dirent => dirent.name).filter(
			lang => pathExists(
				path.join(langsPath, lang, ADDON_CATALOG, addonLangFile)
			)
		);

	const langsAddonFiles: AddonPath[] = [];

	getLangsNames(langsPath).forEach(
		lang => langsAddonFiles.push(
			new AddonPath(
				path.join(langsPath, lang, ADDON_CATALOG, addonLangFile),
				vscode.FileType.Directory
			)
		)
	);

	return langsAddonFiles;
}

export async function getThemeNames(designPath: string) : Promise<string[]> {
	return Promise.resolve(fs.readdirSync(designPath, { withFileTypes: true })
		.filter(dirent => dirent.isDirectory())
		.map(dirent => dirent.name).filter(
			theme => pathExists(
				path.join(designPath, theme)
			)
		)
	);
}

export function getAddonFromPath(path: string) {
	var addon: string = '';

	if (path.includes(ADDON_CATALOG)) {
		const pathPieces = path.split('/');
		const addonsPathIndex = pathPieces.findIndex(p => p === ADDON_CATALOG);
		const addonIndex = addonsPathIndex + 1;

		if (addonsPathIndex && pathPieces?.[addonIndex]?.length > 0) {
			addon = pathPieces[addonIndex];
		}
	}

	return addon;
}
