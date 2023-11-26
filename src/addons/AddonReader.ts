import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getAddonDesignPathes, getAddonJsPath, getAddonPath, getAddonXmlPath, getAddonsPath, getTranslatesPath } from './AddonFiles'; 
import { AddonPath, pathExists } from './AddonPath';

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
		const addonXml = fs.readFileSync(getAddonXmlPath(this.addonsPath, addon).path, 'utf-8');

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

		if (pathExists(this.addonsPath)) {

            const getAddonNames = (addonsPath:string) =>
                fs.readdirSync(addonsPath, { withFileTypes: true })
				.filter(dirent => dirent.isDirectory())
				.map(dirent => dirent.name).filter(
					addon => pathExists(
						path.join(addonsPath, addon, ADDON_XML_FILENAME)
					)
			);
			const addonNames = getAddonNames(this.addonsPath);

			return addonNames;

		} else {
			return [];
		}
	}

	async getAddonPathes(addon: string, offset:number = 0, currentPath:string = ''): Promise<AddonPath[]> {
		const addonPath = [(await getAddonPath(this.addonsPath, addon))];
		const addonDesignPathes = (await getAddonDesignPathes(this.workspaceRoot, addon));
		const addonJsPath = [(await getAddonJsPath(this.workspaceRoot, addon))];
		const addonTranslatesPath = (await getTranslatesPath(this.workspaceRoot, addon));
		
		const pathes = addonPath.concat(addonDesignPathes, addonJsPath, addonTranslatesPath).filter(_path => _path && pathExists(_path.path));

		const addonPathes = pathes.map(_path => {

			const _addonPath = new AddonPath(
				'',
				vscode.FileType.Unknown
			);

			if (
				_path === null
				|| (_path && !_path.path.includes(currentPath))
			) {
				return _addonPath;
			}

			const pathes = [];
			const _distPath = _path.path.replace(this.workspaceRoot, '');
			const pieces = _distPath.split('/').filter(dir => dir);
			const nextFolderKey = offset === -1 ? 0 : offset + 1;

			if (pieces.length <= nextFolderKey) {
				return _addonPath;
			}

			for (let k = 0; k <= nextFolderKey; k++) {
				pathes.push(pieces[k]);
			}

			_addonPath.path = path.join(this.workspaceRoot, pathes.join('/'));
			_addonPath.type = pieces[nextFolderKey].includes('.') ? vscode.FileType.File : _path.type;

			return _addonPath;
		});

		const onlyUnique = (value:AddonPath, index: number, array: AddonPath[]) => {
			return array.findIndex(addonPath => addonPath.path === value.path) === index;
		};
		
		return Promise.resolve(addonPathes.filter(_path => _path && _path.path).filter(onlyUnique));
	}
}
