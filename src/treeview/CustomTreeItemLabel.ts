import * as vscode from 'vscode';

/**
 * Label describing the {@link TreeItem Tree item}
 */
export class TreeItemLabelCustom implements vscode.TreeItemLabel {

	/**
	 * A human-readable string describing the {@link TreeItem Tree item}.
	 */
	label: string = '';

	/**
	 * Ranges in the label to highlight. A range is defined as a tuple of two number where the
	 * first is the inclusive start index and the second the exclusive end index
	 */
	highlights?: Array<[number, number]>;

	strikethrough?: boolean;

	constructor(label: string, highlights: Array<[number, number]>, strikethrough: boolean) {
		this.label = label;
		this.highlights = highlights;
		this.strikethrough = strikethrough;
	}
}