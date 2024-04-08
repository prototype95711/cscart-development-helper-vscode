// This file promisifies necessary file system functions. 
// This should be removed when VS Code updates to Node.js ^11.14 and replaced by the native fs promises.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import { FileStat } from '../addons/AddonExplorer';
import path from 'path';
import * as rimraf from 'rimraf';

function handleResult<T>(resolve: (result: T) => void, reject: (error: Error) => void, error: Error | null | undefined, result: T): void {
	if (error) {
		reject(massageError(error));
	} else {
		resolve(result);
	}
}


function massageError(error: Error & { code?: string }): Error {
	if (error.code === 'ENOENT') {
		return vscode.FileSystemError.FileNotFound();
	}

	if (error.code === 'EISDIR') {
		return vscode.FileSystemError.FileIsADirectory();
	}

	if (error.code === 'EEXIST') {
		return vscode.FileSystemError.FileExists();
	}

	if (error.code === 'EPERM' || error.code === 'EACCES') {
		return vscode.FileSystemError.NoPermissions();
	}

	return error;
}

export function normalizeNFC(items: string): string;
export function normalizeNFC(items: string[]): string[];
export function normalizeNFC(items: string | string[]): string | string[] {
	if (process.platform !== 'darwin') {
		return items;
	}

	if (Array.isArray(items)) {
		return items.map(item => item.normalize('NFC'));
	}

	return items.normalize('NFC');
}

export function readFile(path: string): Promise<Buffer> {
	return new Promise<Buffer>((resolve, reject) => {
		fs.readFile(path, (error, buffer) => handleResult(resolve, reject, error, buffer));
	});
}

export function writeFile(path: string, content: Buffer): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		fs.writeFile(path, content, error => handleResult(resolve, reject, error, void 0));
	});
}

export function stat(path: string): Promise<fs.Stats> {
	return new Promise<fs.Stats>((resolve, reject) => {
		fs.stat(path, (error, stat) => handleResult(resolve, reject, error, stat));
	});
}

export function exists(path: string): Promise<boolean> {
	return new Promise<boolean>((resolve, reject) => {
		fs.exists(path, exists => handleResult(resolve, reject, null, exists));
	});
}

export function readdir(path: string): Promise<string[]> {
	return new Promise<string[]>((resolve, reject) => {
		fs.readdir(path, (error, files) => handleResult(resolve, reject, error, files));
	});
}

export function readfile(path: string): Promise<Buffer> {
	return new Promise<Buffer>((resolve, reject) => {
		fs.readFile(path, (error, buffer) => handleResult(resolve, reject, error, buffer));
	});
}

export function unlink(path: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		fs.unlink(path, error => handleResult(resolve, reject, error, void 0));
	});
}

export function mkdir(path: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		mkdirp.default(path, error => handleResult(resolve, reject, error, void 0));
	});
}

export function writefile(path: string, content: Buffer): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		fs.writeFile(path, content, error => handleResult(resolve, reject, error, void 0));
	});
}

export function rmrf(path: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		rimraf.rimraf(path);
	});
}

export function rename(oldPath: string, newPath: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		fs.rename(oldPath, newPath, error => handleResult(resolve, reject, error, void 0));
	});
}

export async function readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
	const children = await readdir(uri.fsPath);

	const result: [string, vscode.FileType][] = [];
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		const stat = await getStat(path.join(uri.fsPath, child));
		result.push([child, stat.type]);
	}

	return Promise.resolve(result);
}

export async function getStat(path: string): Promise<vscode.FileStat> {
	return new FileStat(await stat(path));
}
