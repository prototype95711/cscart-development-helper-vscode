import path from 'path';

export function isEqual(pathA: string, pathB: string, ignoreCase?: boolean): boolean {
	const identityEquals = (pathA === pathB);
	if (!ignoreCase || identityEquals) {
		return identityEquals;
	}

	if (!pathA || !pathB) {
		return false;
	}

	return equalsIgnoreCase(pathA, pathB);
}

export function equalsIgnoreCase(a: string, b: string): boolean {
	return a.length === b.length && compareSubstringIgnoreCase(a, b) === 0;
}

export function isEqualOrParent(base: string, parentCandidate: string, ignoreCase?: boolean, separator = path.win32.sep): boolean {
    if (base === parentCandidate) {
        return true;
    }

    if (!base || !parentCandidate) {
        return false;
    }

    if (parentCandidate.length > base.length) {
        return false;
    }

    if (ignoreCase) {
        const beginsWith = startsWithIgnoreCase(base, parentCandidate);
        if (!beginsWith) {
            return false;
        }

        if (parentCandidate.length === base.length) {
            return true; // same path, different casing
        }

        let sepOffset = parentCandidate.length;
        if (parentCandidate.charAt(parentCandidate.length - 1) === separator) {
            sepOffset--; // adjust the expected sep offset in case our candidate already ends in separator character
        }

        return base.charAt(sepOffset) === separator;
    }

    if (parentCandidate.charAt(parentCandidate.length - 1) !== separator) {
        parentCandidate += separator;
    }

    return base.indexOf(parentCandidate) === 0;
}

export function startsWithIgnoreCase(str: string, candidate: string): boolean {
    const candidateLength = candidate.length;
    if (candidate.length > str.length) {
        return false;
    }

    return compareSubstringIgnoreCase(str, candidate, 0, candidateLength) === 0;
}

export function compareSubstringIgnoreCase(a: string, b: string, aStart: number = 0, aEnd: number = a.length, bStart: number = 0, bEnd: number = b.length): number {

	for (; aStart < aEnd && bStart < bEnd; aStart++, bStart++) {

		let codeA = a.charCodeAt(aStart);
		let codeB = b.charCodeAt(bStart);

		if (codeA === codeB) {
			// equal
			continue;
		}

		if (codeA >= 128 || codeB >= 128) {
			// not ASCII letters -> fallback to lower-casing strings
			return compareSubstring(a.toLowerCase(), b.toLowerCase(), aStart, aEnd, bStart, bEnd);
		}

		// mapper lower-case ascii letter onto upper-case varinats
		// [97-122] (lower ascii) --> [65-90] (upper ascii)
		if (isLowerAsciiLetter(codeA)) {
			codeA -= 32;
		}
		if (isLowerAsciiLetter(codeB)) {
			codeB -= 32;
		}

		// compare both code points
		const diff = codeA - codeB;
		if (diff === 0) {
			continue;
		}

		return diff;
	}

	const aLen = aEnd - aStart;
	const bLen = bEnd - bStart;

	if (aLen < bLen) {
		return -1;
	} else if (aLen > bLen) {
		return 1;
	}

	return 0;
}

export function compareSubstring(a: string, b: string, aStart: number = 0, aEnd: number = a.length, bStart: number = 0, bEnd: number = b.length): number {
	for (; aStart < aEnd && bStart < bEnd; aStart++, bStart++) {
		const codeA = a.charCodeAt(aStart);
		const codeB = b.charCodeAt(bStart);
		if (codeA < codeB) {
			return -1;
		} else if (codeA > codeB) {
			return 1;
		}
	}
	const aLen = aEnd - aStart;
	const bLen = bEnd - bStart;
	if (aLen < bLen) {
		return -1;
	} else if (aLen > bLen) {
		return 1;
	}
	return 0;
}

export function isLowerAsciiLetter(code: number): boolean {
	return code >= 97 && code <= 122; //a-z
}

/**
 * Removes all occurrences of needle from the end of haystack.
 * @param haystack string to trim
 * @param needle the thing to trim
 */
export function rtrim(haystack: string, needle: string): string {
	if (!haystack || !needle) {
		return haystack;
	}

	const needleLen = needle.length,
		haystackLen = haystack.length;

	if (needleLen === 0 || haystackLen === 0) {
		return haystack;
	}

	let offset = haystackLen,
		idx = -1;

	while (true) {
		idx = haystack.lastIndexOf(needle, offset - 1);
		if (idx === -1 || idx + needleLen !== offset) {
			break;
		}
		if (idx === 0) {
			return '';
		}
		offset = idx;
	}

	return haystack.substring(0, offset);
}
