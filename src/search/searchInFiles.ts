/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Range } from './range';

export interface IPatternInfo {
	pattern: string;
	isRegExp?: boolean;
	isWordMatch?: boolean;
	wordSeparators?: string;
	isMultiline?: boolean;
	isUnicode?: boolean;
	isCaseSensitive?: boolean;
	notebookInfo?: INotebookPatternInfo;
}

export interface INotebookPatternInfo {
	isInNotebookMarkdownInput?: boolean;
	isInNotebookMarkdownPreview?: boolean;
	isInNotebookCellInput?: boolean;
	isInNotebookCellOutput?: boolean;
}

export interface UriComponents {
	scheme: string;
	authority?: string;
	path?: string;
	query?: string;
	fragment?: string;
}

export interface ISearchRange {
	readonly startLineNumber: number;
	readonly startColumn: number;
	readonly endLineNumber: number;
	readonly endColumn: number;
}

export interface ITextSearchMatch<U extends UriComponents = vscode.Uri> {
	uri?: U;
	ranges: ISearchRange | ISearchRange[];
	preview: ITextSearchResultPreview;
	webviewIndex?: number;
}

export function resultIsMatch(result: ITextSearchResult): result is ITextSearchMatch {
	return !!(<ITextSearchMatch>result).preview;
}

export interface ITextSearchResultPreview {
	text: string;
	matches: ISearchRange | ISearchRange[];
	cellFragment?: string;
}

export interface ITextSearchContext<U extends UriComponents = vscode.Uri> {
	uri?: U;
	text: string;
	lineNumber: number;
}

export interface TextSearchPreviewOptions {
    /**
     * The maximum number of lines in the preview.
     * Only search providers that support multiline search will ever return more than one line in the match.
     */
    matchLines: number;

    /**
     * The maximum number of characters included per line.
     */
    charsPerLine: number;
}

export type ITextSearchResult<U extends UriComponents = vscode.Uri> = ITextSearchMatch<U> | ITextSearchContext<U>;

export const getFileResults = (
	bytes: Uint8Array,
	pattern: RegExp,
	options: {
		beforeContext: number;
		afterContext: number;
		previewOptions: TextSearchPreviewOptions | undefined;
		remainingResultQuota: number;
	}
): ITextSearchResult[] => {

	let text: string;
	if (bytes[0] === 0xff && bytes[1] === 0xfe) {
		text = new TextDecoder('utf-16le').decode(bytes);
	} else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
		text = new TextDecoder('utf-16be').decode(bytes);
	} else {
		text = new TextDecoder('utf8').decode(bytes);
		if (text.slice(0, 1000).includes('\uFFFD') && bytes.includes(0)) {
			return [];
		}
	}

	const results: ITextSearchResult[] = [];

	const patternIndecies: { matchStartIndex: number; matchedText: string }[] = [];

	let patternMatch: RegExpExecArray | null = null;
	let remainingResultQuota = options.remainingResultQuota;
	while (remainingResultQuota >= 0 && (patternMatch = pattern.exec(text))) {
		patternIndecies.push({ matchStartIndex: patternMatch.index, matchedText: patternMatch[0] });
		remainingResultQuota--;
	}

	if (patternIndecies.length) {
		const contextLinesNeeded = new Set<number>();
		const resultLines = new Set<number>();

		const lineRanges: { start: number; end: number }[] = [];
		const readLine = (lineNumber: number) => text.slice(lineRanges[lineNumber].start, lineRanges[lineNumber].end);

		let prevLineEnd = 0;
		let lineEndingMatch: RegExpExecArray | null = null;
		const lineEndRegex = /\r?\n/g;
		while ((lineEndingMatch = lineEndRegex.exec(text))) {
			lineRanges.push({ start: prevLineEnd, end: lineEndingMatch.index });
			prevLineEnd = lineEndingMatch.index + lineEndingMatch[0].length;
		}
		if (prevLineEnd < text.length) { lineRanges.push({ start: prevLineEnd, end: text.length }); }

		let startLine = 0;
		for (const { matchStartIndex, matchedText } of patternIndecies) {
			if (remainingResultQuota < 0) {
				break;
			}

			while (Boolean(lineRanges[startLine + 1]) && matchStartIndex > lineRanges[startLine].end) {
				startLine++;
			}
			let endLine = startLine;
			while (Boolean(lineRanges[endLine + 1]) && matchStartIndex + matchedText.length > lineRanges[endLine].end) {
				endLine++;
			}

			if (options.beforeContext) {
				for (let contextLine = Math.max(0, startLine - options.beforeContext); contextLine < startLine; contextLine++) {
					contextLinesNeeded.add(contextLine);
				}
			}

			let previewText = '';
			let offset = 0;
			for (let matchLine = startLine; matchLine <= endLine; matchLine++) {
				let previewLine = readLine(matchLine);
				if (options.previewOptions?.charsPerLine && previewLine.length > options.previewOptions.charsPerLine) {
					offset = Math.max(matchStartIndex - lineRanges[startLine].start - 20, 0);
					previewLine = previewLine.substr(offset, options.previewOptions.charsPerLine);
				}
				previewText += `${previewLine}\n`;
				resultLines.add(matchLine);
			}

			const fileRange = new Range(
				startLine,
				matchStartIndex - lineRanges[startLine].start,
				endLine,
				matchStartIndex + matchedText.length - lineRanges[endLine].start
			);
			const previewRange = new Range(
				0,
				matchStartIndex - lineRanges[startLine].start - offset,
				endLine - startLine,
				matchStartIndex + matchedText.length - lineRanges[endLine].start - (endLine === startLine ? offset : 0)
			);

			const match: ITextSearchResult = {
				ranges: fileRange,
				preview: { text: previewText, matches: previewRange },
			};
			results.push(match);

			if (options.afterContext) {
				for (let contextLine = endLine + 1; contextLine <= Math.min(endLine + options.afterContext, lineRanges.length - 1); contextLine++) {
					contextLinesNeeded.add(contextLine);
				}
			}
		}
		for (const contextLine of contextLinesNeeded) {
			if (!resultLines.has(contextLine)) {

				results.push({
					text: readLine(contextLine),
					lineNumber: contextLine + 1,
				});
			}
		}
	}
	return results;
};
