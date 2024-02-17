import * as vscode from 'vscode';

export class ResourceEdit {

	protected constructor(readonly metadata?: vscode.WorkspaceEditMetadata) { }

	static convert(edit: WorkspaceEdit): ResourceEdit[] {

		return edit.edits.map(edit => {
			if (ResourceFileEdit.is(edit)) {
				return ResourceFileEdit.lift(edit);
			}
			throw new Error('Unsupported edit');
		});
	}
}

export class ResourceFileEdit extends ResourceEdit implements IWorkspaceFileEdit {

	static is(candidate: any): candidate is IWorkspaceFileEdit {
		if (candidate instanceof ResourceFileEdit) {
			return true;
		} else {
			return isObject(candidate)
				&& (Boolean((<IWorkspaceFileEdit>candidate).newResource) || Boolean((<IWorkspaceFileEdit>candidate).oldResource));
		}
	}

	static lift(edit: IWorkspaceFileEdit): ResourceFileEdit {
		if (edit instanceof ResourceFileEdit) {
			return edit;
		} else {
			return new ResourceFileEdit(edit.oldResource, edit.newResource, edit.options, edit.metadata);
		}
	}

	constructor(
		readonly oldResource: vscode.Uri | undefined,
		readonly newResource: vscode.Uri | undefined,
		readonly options: WorkspaceFileEditOptions = {},
		metadata?: vscode.WorkspaceEditMetadata
	) {
		super(metadata);
	}
}

export interface WorkspaceFileEditOptions {
	overwrite?: boolean;
	ignoreIfNotExists?: boolean;
	ignoreIfExists?: boolean;
	recursive?: boolean;
	copy?: boolean;
	folder?: boolean;
	skipTrashBin?: boolean;
	maxSize?: number;

	/**
	 * @internal
	 */
	contents?: Promise<Buffer>;
}

export interface IWorkspaceFileEdit {
	oldResource?: vscode.Uri;
	newResource?: vscode.Uri;
	options?: WorkspaceFileEditOptions;
	metadata?: vscode.WorkspaceEditMetadata;
}

export interface IWorkspaceTextEdit {
	resource: vscode.Uri;
	textEdit: vscode.TextEdit & { insertAsSnippet?: boolean };
	versionId: number | undefined;
	metadata?: vscode.WorkspaceEditMetadata;
}

export interface WorkspaceEdit {
	edits: Array<IWorkspaceTextEdit | IWorkspaceFileEdit>;
}

export function isObject(obj: unknown): obj is Object {
	// The method can't do a type cast since there are type (like strings) which
	// are subclasses of any put not positvely matched by the function. Hence type
	// narrowing results in wrong results.
	return typeof obj === 'object'
		&& obj !== null
		&& !Array.isArray(obj)
		&& !(obj instanceof RegExp)
		&& !(obj instanceof Date);
}
