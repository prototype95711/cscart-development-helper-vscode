import * as path from 'path';

const APP_CATALOG = 'app';
const ADDON_CATALOG = 'addons';
const ADDON_XML_FILENAME = 'addon.xml';

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
