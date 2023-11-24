import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getAddonDesignPathes, getAddonPath, getAddonsPath } from './AddonFiles';
import { off } from 'process';

const { parseString } = require('xml2js');

const ADDON_XML_FILENAME = 'addon.xml';
const ADDON_XML_INVALID_ERROR = 'addon.xml document is invalid???';

export class AddonReader {

	private addonsPath: string = '';

    constructor(public workspaceRoot: string) {
		this.addonsPath = getAddonsPath(workspaceRoot);
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

	async getAddonFolders(addon: string, offset:number = 0, currentPath:string = ''): Promise<string[]> {
		const addonDesignPathes = (await getAddonDesignPathes(this.workspaceRoot, addon))
			.filter(folder => this.pathExists(folder));

		const addonPathes = addonDesignPathes.map(_path => {

			if (path && !_path.includes(currentPath)) {
				return '';
			}

			const pathes = [];
			const _distPath = _path.replace(this.workspaceRoot, '');
			const pieces = _distPath.split('/').filter(dir => dir);
			const nextFolderKey = offset === -1 ? 0 : offset + 1;

			if (pieces.length <= nextFolderKey) {
				return '';
			}

			for (let k = 0; k <= nextFolderKey; k++) {
				pathes.push(pieces[k]);
			}

			const result = path.join(this.workspaceRoot, pathes.join('/'));

			return result;
		});

		const onlyUnique = (value:string, index: number, array: string[]) => {
			return array.indexOf(value) === index;
		};
		
		return Promise.resolve(addonPathes.filter(dir => dir).filter(onlyUnique));
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
