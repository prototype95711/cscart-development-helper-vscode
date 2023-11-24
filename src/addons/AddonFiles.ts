import * as path from 'path';

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

export function getAddonsPath(workspaceRoot: string | undefined) {

	if (!workspaceRoot) {
		return '';
	}

	return path.join(workspaceRoot, APP_CATALOG, ADDON_CATALOG);
}

export function getAddonPath(addonsPath: string | undefined, addon: string) {

	if (!addonsPath) {
		return '';
	}

	return path.join(addonsPath, addon, ADDON_XML_FILENAME);
}

export async function getAddonDesignPathes(workspaceRoot: string | undefined, addon: string) {

	if (!workspaceRoot) {
		return [];
	}

	const designPath = path.join(workspaceRoot, DESIGN_CATALOG);
	const designBackendPathes = DESIGN_PARTS.map(
		part => path.join(designPath, DESIGN_BACKEND_CATALOG, part, ADDON_CATALOG, addon)
	);
	const designThemesPathes = DESIGN_PARTS.map(
		part => path.join(designPath, DESIGN_THEMES_CATALOG, part, ADDON_CATALOG, addon)
	);
	
	return designBackendPathes.concat(designThemesPathes);
}
