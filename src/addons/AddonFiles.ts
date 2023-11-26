import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AddonPath, pathExists } from './AddonPath';

const APP_CATALOG = 'app';
const ADDON_CATALOG = 'addons';
const ADDON_XML_FILENAME = 'addon.xml';

const DESIGN_CATALOG = 'design';
const DESIGN_BACKEND_CATALOG = 'backend';
const DESIGN_THEMES_CATALOG = 'themes';
const DESIGN_PARTS = [
	'css',
	'mail/templates',
	'media/images',
	'templates'
];
const DESIGN_THEME_MANIFEST_FILENAME = 'manifest.json';

const JS_CATALOG = 'js';

const VAR_PATH = 'var';
const VAR_LANGS = 'langs';

const VAR_LANG_FILE_EXTENSION = '.po';

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
	
	const designThemesPathes = path.join(designPath, DESIGN_THEMES_CATALOG);

	const getThemeNames = (designPath:string) =>
		fs.readdirSync(designPath, { withFileTypes: true })
		.filter(dirent => dirent.isDirectory())
		.map(dirent => dirent.name).filter(
			theme => pathExists(
				path.join(designPath, theme, DESIGN_THEME_MANIFEST_FILENAME)
			)
	);
	
	const designThemesAddonPathes: AddonPath[] = [];

	getThemeNames(designThemesPathes).forEach(
		themePath => DESIGN_PARTS.map(
			part => designThemesAddonPathes.push(
				new AddonPath(
					path.join(designThemesPathes, themePath, part, ADDON_CATALOG, addon),
					vscode.FileType.Directory
				)
			)
		)
	);
	
	return designBackendPathes.concat(designThemesAddonPathes);
}

export async function getAddonJsPath(workspaceRoot: string | undefined, addon: string) {

	if (!workspaceRoot) {
		return null;
	}

	return new AddonPath(path.join(workspaceRoot, JS_CATALOG, ADDON_CATALOG, addon), vscode.FileType.Directory);
}

export async function getTranslatesPath(workspaceRoot: string | undefined, addon: string) {

	if (!workspaceRoot) {
		return [];
	}

	const langsPath = path.join(workspaceRoot, VAR_PATH, VAR_LANGS);
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
