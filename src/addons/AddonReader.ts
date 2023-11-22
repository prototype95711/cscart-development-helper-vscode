import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getAddonPath } from './AddonsPath';

const { parseString } = require('xml2js');

const ADDON_XML_FILENAME = 'addon.xml';
const ADDON_XML_INVALID_ERROR = 'addon.xml document is invalid???';

export class AddonReader {

    constructor(private addonsPath: string) {
	}

	getAddonData(addon: string): any {
		var addonJson = '';
		const addonXml = fs.readFileSync(getAddonPath(this.addonsPath, addon), 'utf-8');

		const reading = (err: any, result: any) => {
			if (err || !result) {
				vscode.window.showErrorMessage(ADDON_XML_INVALID_ERROR);
			} else {
				addonJson = JSON.stringify(result);
			}
		};

		parseString(
			addonXml,
			reading
		);

		return JSON.parse(addonJson);
	}

	getAddons(): string[] {

		if (this.pathExists(this.addonsPath)) {

            const getAddonNames = (addonsPath:string) =>
                fs.readdirSync(addonsPath, { withFileTypes: true })
				.filter(dirent => dirent.isDirectory())
				.map(dirent => dirent.name).filter(
					addon => this.pathExists(
						path.join(addonsPath, addon, ADDON_XML_FILENAME)
					)
			);
			const addonNames = getAddonNames(this.addonsPath);

			return addonNames;

		} else {
			return [];
		}
	}

	private pathExists(p: string): boolean {
		try {
			fs.accessSync(p);
		} catch (err) {
			return false;
		}

		return true;
	}
}
