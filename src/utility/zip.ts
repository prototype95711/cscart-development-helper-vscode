import { createWriteStream, promises, WriteStream } from 'fs';
import type { Entry, ZipFile } from 'yauzl';

export const CorruptZipMessage: string = 'end of central directory record signature not found';

export interface IExtractOptions {
	overwrite?: boolean;

	/**
	 * Source path within the ZIP archive. Only the files contained in this
	 * path will be extracted.
	 */
	sourcePath?: string;
}

function modeFromEntry(entry: Entry) {
	const attr = entry.externalFileAttributes >> 16 || 33188;

	return [448 /* S_IRWXU */, 56 /* S_IRWXG */, 7 /* S_IRWXO */]
		.map(mask => attr & mask)
		.reduce((a, b) => a + b, attr & 61440 /* S_IFMT */);
}

export interface IFile {
	path: string;
	contents?: Buffer | string;
	localPath?: string;
}

export async function zip(zipPath: string, files: IFile[]): Promise<string> {
	const { ZipFile } = await import('yazl');

	return new Promise<string>((c, e) => {
		const zip = new ZipFile();
		files.forEach(f => {
			if (f.contents) {
				zip.addBuffer(typeof f.contents === 'string' ? Buffer.from(f.contents, 'utf8') : f.contents, f.path);
			} else if (f.localPath) {
				zip.addFile(f.localPath, f.path);
			}
		});
		zip.end();

		const zipStream = createWriteStream(zipPath);
		zip.outputStream.pipe(zipStream);

		zip.outputStream.once('error', e);
		zipStream.once('error', e);
		zipStream.once('finish', () => c(zipPath));
	});
}
