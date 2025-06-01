import * as vscode from 'vscode';
import { window } from 'vscode';

import { AddonReader } from '../AddonReader';
import { AddonEntry, AddonExplorer } from '../explorer/AddonExplorer';
import { Addon } from '../../treeview/AddonTreeItem';
import { AddonPath } from '../files/AddonPath';
import { getTranslatesPath } from '../files/AddonFiles';

export async function showNewTranslateFilePicker(
    addon: string,
    addonReader: AddonReader, 
    addonExplorer: AddonExplorer,
    view: vscode.TreeView<Addon | AddonEntry>,
    onDidChangeSelectionCallback: (
        selectedFile: string,
        addonExplorer: AddonExplorer, 
        addon: string
    ) => Promise<void>
) {
    const picker = new NewTranslateFilePicker(addonReader);
    const pick = window.createQuickPick();
    pick.items = await picker.getAddonPickerList(addon);
    pick.onDidChangeSelection(selection => {
        if (selection[0]) {
            onDidChangeSelectionCallback(selection[0].label, addonExplorer, addon);
        }
        pick.hide();
    });
    pick.onDidHide(() => pick.dispose());
    pick.show();
}

class NewTranslateFilePicker {

    constructor(private addonReader: AddonReader) {
    }

    async getAddonPickerList(addon: string): Promise<vscode.QuickPickItem[]> {
        const addonNotExistsTFiles: AddonPath[] = await getTranslatesPath(
            this.addonReader.workspaceRoot,
            addon,
            true
        );

        addonNotExistsTFiles.sort((a: AddonPath, b: AddonPath) => {
            if (a.path < b.path) {
              return -1;
            }
            if (a.path > b.path) {
              return 1;
            }

            return 0;
        });

        const getNewTFilesItems = (addonNotExistsTFiles: AddonPath[]) => addonNotExistsTFiles
            ? addonNotExistsTFiles.map(tf => ({label: tf.path.replace(this.addonReader.workspaceRoot, '') }))
            : [];

        return Promise.resolve(getNewTFilesItems(addonNotExistsTFiles));
    }
}

