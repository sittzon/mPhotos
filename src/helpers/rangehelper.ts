export type RangeParseResult =
    | { type: 'none' }
    | { type: 'invalid' }
    | { type: 'unsatisfiable' }
    | { type: 'satisfiable'; start: number; end: number };

// Parse a single-range "Range: bytes=..." header. Multiple ranges are not
// supported; returning `invalid` makes the caller refuse rather than stream a
// nonsensical slice. Also validates against the file size so we never call
// createReadStream with NaN or an out-of-bounds offset.
export function parseRangeHeader(header: string | null, fileSize: number): RangeParseResult {
    if (!header) return { type: 'none' };

    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match) return { type: 'invalid' };

    const startRaw = match[1];
    const endRaw = match[2];
    if (!startRaw && !endRaw) return { type: 'invalid' };

    let start: number;
    let end: number;

    if (!startRaw) {
        // Suffix range: the last N bytes of the file.
        const suffixLength = parseInt(endRaw, 10);
        if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { type: 'invalid' };
        start = Math.max(0, fileSize - suffixLength);
        end = fileSize - 1;
    } else {
        start = parseInt(startRaw, 10);
        if (!Number.isFinite(start) || start < 0) return { type: 'invalid' };
        // A start at or beyond EOF is unsatisfiable (416), not malformed (400).
        if (fileSize <= 0 || start >= fileSize) return { type: 'unsatisfiable' };
        end = endRaw ? parseInt(endRaw, 10) : fileSize - 1;
        if (!Number.isFinite(end) || start > end) return { type: 'invalid' };
    }

    if (fileSize <= 0) return { type: 'unsatisfiable' };

    return { type: 'satisfiable', start, end: Math.min(end, fileSize - 1) };
}
