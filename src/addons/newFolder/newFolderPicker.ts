import * as vscode from 'vscode';
import { window } from 'vscode';

import { AddonReader } from '../AddonReader';
import { AddonEntry, AddonExplorer } from '../explorer/AddonExplorer';
import { Addon } from '../../treeview/AddonTreeItem';
import { AddonPath } from '../files/AddonPath';

export async function showNewAddonFolderPicker(
    addon: string,
    addonReader: AddonReader, 
    addonExplorer: AddonExplorer,
    view: vscode.TreeView<Addon | AddonEntry>,
    onDidChangeSelectionCallback: (
        selectedFolder: string,
        addonExplorer: AddonExplorer, 
        view: vscode.TreeView<Addon | AddonEntry>
    ) => Promise<void>
) {
    const picker = new NewAddonFolderPicker(addonReader);
    const pick = window.createQuickPick();
    pick.items = await picker.getAddonPickerList(addon);
    pick.onDidChangeSelection(selection => {
        if (selection[0]) {
            onDidChangeSelectionCallback(selection[0].label, addonExplorer, view);
        }
        pick.hide();
    });
    pick.onDidHide(() => pick.dispose());
    pick.show();
}

class NewAddonFolderPicker {

    constructor(private addonReader: AddonReader) {
    }

    async getAddonPickerList(addon: string): Promise<vscode.QuickPickItem[]> {
        const addonNotExistsPathes: AddonPath[] = await this.addonReader.getAddonPathes(
            addon,
            -2,
            '',
            {getNotExists: true}
        );

        addonNotExistsPathes.sort((a: AddonPath, b: AddonPath) => {
            if (a.path < b.path) {
              return -1;
            }
            if (a.path > b.path) {
              return 1;
            }

            return 0;
        });

        const getNewFoldersItems = (addonNotExistsPathes: AddonPath[]) => addonNotExistsPathes
            ? addonNotExistsPathes.map(ap => ({label: ap.path.replace(this.addonReader.workspaceRoot, '') }))
            : [];

        return Promise.resolve(getNewFoldersItems(addonNotExistsPathes));
    }
}

