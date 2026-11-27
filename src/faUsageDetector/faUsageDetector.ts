import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

/**
 * This tool should work alone but also be consumed by cli version
*
* SPEC
* 
* We will pass strings from css files or html file or webarchive text files
* It might be good if we can either supply string or files
* possible files:
* css, html, archive.txt.gz
* 
* There are some fixture files in tests/fixtures/ please dont waste time reading them
* they only exist fior you to run the detector over and get results
* 
* I have supplied REGEXP vars for detecting classnames and css `content: ""` escapes
* 
* The ideal results should show what classes were matched and whether any escapes were matched
* if possible where they were matched if you cant get line number easilly thats fine would be nice tho.
* 
* Prom there we can work out what variant fonts we actually need fo specific sites.
*/

// NOTE there are more classes than this but this is enough for our range
// Classnames to generaly run thru html or js strings
const REGEXP_FA_CLASSNAMES = /\b(?:fa-brands|fa-duotone|fa-light|fa-regular|fa-solid|fa-classic|fab|fad|fal|far|fas|fa)\b/gm
const REGEXP_FA_MODERN_CLASSNAMES = /\b(fab|fad|fal|far|fas)\b/gm;
const REGEXP_FA_LEGACY_CLASSNAMES = /\b(?:fa-brands|fa-duotone|fa-light|fa-regular|fa-solid|fa-classic|fa)\b/gm;
// escapes for css filte where we may be using psuedo element with content for the icons
// NB this should only be used for custom css not the fa css which will obviously contain them
const REGEXP_FA_PSUEDO_CONTENT_ESCAPES = /\\f[0-9a-fA-F]{3}/gi;
const REGEXP_WEBFONT_FILENAME = /[a-z0-9_.-]*\.(?:woff2?|ttf|otf|eot|svg)(?=$|[?#\s"'(){};<>])/iy;

const gunzipAsync = promisify(gunzip);

export interface FaUsageMatch {
  value: string;
  count: number;
  lines: number[];
  warcTargetUri?: string;
}

export interface FaUsageClassMatch extends FaUsageMatch {
  families: Array<'modern' | 'legacy'>;
}

export interface FaUsageDetectorResult {
  source?: string;
  classes: FaUsageClassMatch[];
  escapes: FaUsageMatch[];
  skippedWarcTargetUris?: string[];
}

export interface FaUsageDetectorOptions {
  ignoreWarcTargetUris?: readonly string[];
}

interface WarcHeader {
  bodyStart: number;
  hasSeparator: boolean;
  targetUri?: string;
  contentLength?: number;
}

interface WarcRange {
  start: number;
  end: number;
  targetUri: string;
}

function readWarcHeader(text: string, start: number): WarcHeader | undefined {
  const firstLineEnd = text.indexOf('\n', start);
  if (firstLineEnd === -1 || !/^WARC\/1\.[01]\r?$/.test(text.slice(start, firstLineEnd))) {
    return undefined;
  }

  let position = firstLineEnd + 1;
  let type: string | undefined;
  let recordId: string | undefined;
  let targetUri: string | undefined;
  let length: string | undefined;
  let hasSeparator = false;

  while (position < text.length) {
    const end = text.indexOf('\n', position);
    const next = end === -1 ? text.length : end;
    const line = text.slice(position, next).replace(/\r$/, '');
    if (line === '') {
      position = end === -1 ? next : next + 1;
      hasSeparator = true;
      break;
    }

    const field = /^([A-Za-z0-9-]+):[ \t]*(.*)$/.exec(line);
    if (!field) break;
    switch (field[1].toLowerCase()) {
      case 'warc-type': type = field[2]; break;
      case 'warc-record-id': recordId = field[2]; break;
      case 'warc-target-uri': targetUri = Buffer.from(field[2], 'latin1').toString('utf8'); break;
      case 'content-length': if (length === undefined) length = field[2]; break;
    }
    position = end === -1 ? next : next + 1;
  }

  if (!type || !recordId) return undefined;
  if (hasSeparator && (length === undefined || !/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
    throw new Error('Invalid or missing WARC Content-Length');
  }
  return {
    bodyStart: position,
    hasSeparator,
    targetUri,
    contentLength: length === undefined ? undefined : Number(length),
  };
}

function processWarcRecords(bytes: Buffer, ignoredUris: readonly string[]): {
  content: string;
  skippedUris: string[];
  ranges: WarcRange[];
} {
  const ignored = new Set(ignoredUris);
  const patterns = ignoredUris.filter((entry) =>
    /[*[{]/.test(entry) || (!entry.includes('/') && entry.includes('?')),
  );
  const isIgnored = (uri: string): boolean => {
    if (ignored.has(uri)) return true;
    return patterns.some((pattern) => {
      const target = pattern.includes('?') ? uri : uri.split(/[?#]/, 1)[0];
      const candidate = pattern.includes('/') ? target : target.slice(target.lastIndexOf('/') + 1);
      return posix.matchesGlob(candidate, pattern);
    });
  };
  const skipped = new Set<string>();
  // Latin-1 keeps string offsets equal to byte offsets for WARC Content-Length.
  const text = bytes.toString('latin1');
  const marker = /^WARC\/1\.[01]\r?$/gm;
  const chunks: string[] = [];
  const ranges: WarcRange[] = [];
  let length = 0;
  let copiedUntil = 0;
  let position = 0;
  const append = (text: string): void => {
    chunks.push(text);
    length += text.length;
  };

  while (position < text.length) {
    marker.lastIndex = position;
    const match = marker.exec(text);
    if (!match) break;
    const header = readWarcHeader(text, match.index);
    if (!header) {
      position = marker.lastIndex;
      continue;
    }

    let end: number;
    if (header.hasSeparator) {
      end = header.bodyStart + header.contentLength!;
      if (end > bytes.length) throw new Error('Truncated WARC record');
      if (end < bytes.length && text[end] !== '\r' && text[end] !== '\n') {
        throw new Error('Invalid WARC record boundary');
      }
    } else {
      // Text exports may have stripped all empty lines and invalidated byte lengths.
      marker.lastIndex = header.bodyStart;
      let next = marker.exec(text);
      while (next && !readWarcHeader(text, next.index)) next = marker.exec(text);
      end = next ? next.index : text.length;
    }

    append(bytes.subarray(copiedUntil, match.index).toString('utf8'));
    const record = bytes.subarray(match.index, end).toString('utf8');
    const start = length;
    if (header.targetUri && isIgnored(header.targetUri)) {
      append(record.replace(/[^\r\n]/g, ' '));
      skipped.add(header.targetUri);
    } else {
      append(record);
      if (header.targetUri) ranges.push({ start, end: length, targetUri: header.targetUri });
    }
    copiedUntil = end;
    position = end;
  }

  append(bytes.subarray(copiedUntil).toString('utf8'));
  return { content: chunks.join(''), skippedUris: Array.from(skipped), ranges };
}

function lineAt(index: number, lineStarts: number[]): number {
  let low = 0;
  let high = lineStarts.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] <= index) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function collectMatches(
  content: string,
  regexp: RegExp,
  lineStarts: number[],
  ranges: WarcRange[],
  excludeWebfontFilenames = false,
): Map<string, FaUsageMatch> {
  const matches = new Map<string, FaUsageMatch>();
  regexp.lastIndex = 0;
  let rangeIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regexp.exec(content)) !== null) {
    if (excludeWebfontFilenames) {
      REGEXP_WEBFONT_FILENAME.lastIndex = match.index;
      if (REGEXP_WEBFONT_FILENAME.test(content)) continue;
    }
    const value = match[0];
    const line = lineAt(match.index, lineStarts);
    while (rangeIndex < ranges.length && match.index >= ranges[rangeIndex].end) rangeIndex += 1;
    const range = ranges[rangeIndex];
    const targetUri = range && match.index >= range.start ? range.targetUri : undefined;
    const key = JSON.stringify([value, targetUri]);
    const existing = matches.get(key);

    if (existing) {
      existing.count += 1;
      if (existing.lines[existing.lines.length - 1] !== line) {
        existing.lines.push(line);
      }
    } else {
      const item: FaUsageMatch = { value, count: 1, lines: [line] };
      if (targetUri !== undefined) item.warcTargetUri = targetUri;
      matches.set(key, item);
    }
  }

  regexp.lastIndex = 0;
  return matches;
}

export function faUsageDetector(
  content: string,
  source?: string,
  options: FaUsageDetectorOptions = {},
): FaUsageDetectorResult {
  return detectContent(content, source, options);
}

function detectContent(
  content: string,
  source: string | undefined,
  options: FaUsageDetectorOptions,
  originalBytes?: Buffer,
): FaUsageDetectorResult {
  const archive = processWarcRecords(
    originalBytes ?? Buffer.from(content, 'utf8'),
    options.ignoreWarcTargetUris ?? [],
  );
  content = archive.content;
  const lineStarts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '\n') {
      lineStarts.push(index + 1);
    }
  }

  const modernValues = new Set(
    Array.from(collectMatches(content, REGEXP_FA_MODERN_CLASSNAMES, lineStarts, archive.ranges, true).values(), (match) => match.value),
  );
  const legacyValues = new Set(
    Array.from(collectMatches(content, REGEXP_FA_LEGACY_CLASSNAMES, lineStarts, archive.ranges, true).values(), (match) => match.value),
  );
  const classes = Array.from(
    collectMatches(content, REGEXP_FA_CLASSNAMES, lineStarts, archive.ranges, true).values(),
    (match): FaUsageClassMatch => ({
      ...match,
      families: [
        ...(modernValues.has(match.value) ? ['modern' as const] : []),
        ...(legacyValues.has(match.value) ? ['legacy' as const] : []),
      ],
    }),
  );

  const result: FaUsageDetectorResult = {
    classes,
    escapes: Array.from(
      collectMatches(content, REGEXP_FA_PSUEDO_CONTENT_ESCAPES, lineStarts, archive.ranges).values(),
    ),
  };

  if (source !== undefined) {
    result.source = source;
  }
  if (options.ignoreWarcTargetUris !== undefined) {
    result.skippedWarcTargetUris = archive.skippedUris;
  }

  return result;
}

export async function faUsageDetectorFile(
  filePath: string,
  options: FaUsageDetectorOptions = {},
): Promise<FaUsageDetectorResult> {
  const file = await readFile(filePath);
  const content = filePath.toLowerCase().endsWith('.gz')
    ? await gunzipAsync(file)
    : file;

  return detectContent(content.toString('utf8'), filePath, options, content);
}