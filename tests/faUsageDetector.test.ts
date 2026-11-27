import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { faUsageDetector, faUsageDetectorFile } from '../src/faUsageDetector/faUsageDetector.js';
import { runFaUsageDetectorCli } from '../src/faUsageDetector/faUsageDetector.cli.js';

const excludedUri = 'https://example.test/fontawesome.css';
const retainedUri = 'https://example.test/custom.css';

function warcRecord(uri: string, body: string): string {
  return `WARC/1.0\r\nWARC-Type: response\r\nWARC-Record-ID: <urn:uuid:test>\r\nWARC-Target-URI: ${uri}\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}\r\n\r\n`;
}

describe('faUsageDetector', () => {
  it('finds class prefixes and CSS escapes with occurrence counts and line numbers', () => {
    const result = faUsageDetector(
      '<i class="fa-solid fa-user fab"></i>\n.icon::before { content: "\\f101"; }\n<i class="fa-solid">',
      'page.html',
    );

    expect(result).toEqual({
      source: 'page.html',
      classes: [
        { value: 'fa-solid', count: 2, lines: [1, 3], families: ['legacy'] },
        { value: 'fa', count: 1, lines: [1], families: ['legacy'] },
        { value: 'fab', count: 1, lines: [1], families: ['modern'] },
      ],
      escapes: [{ value: '\\f101', count: 1, lines: [2] }],
    });
  });

  it('excludes exact WARC targets without changing retained line numbers', () => {
      const ignored = warcRecord(excludedUri, 'é\n.fab { content: "\\f111" }\n');
      const kept = warcRecord(`${excludedUri}?v=2`, '<i class="far"></i>\n.x { content: "\\f222" }');
      const content = ignored + kept;
      const baseline = faUsageDetector(content);
      const result = faUsageDetector(content, 'archive', { ignoreWarcTargetUris: [excludedUri] });

      expect(result.classes).toEqual(baseline.classes.filter((match) => match.value === 'far'));
      expect(result.escapes).toEqual(baseline.escapes.filter((match) => match.value === '\\f222'));
      expect(result.skippedWarcTargetUris).toEqual([excludedUri]);
    });

  it('groups both classes and escapes by WARC target URI, including repeated records', () => {
    const body = 'fab \\f111';
    const content = warcRecord(excludedUri, `é ${body}`) +
      warcRecord(retainedUri, body) + warcRecord(excludedUri, body);
    const result = faUsageDetector(content);

    expect(result.classes).toEqual([
      { value: 'fab', count: 2, lines: [7, 23], warcTargetUri: excludedUri, families: ['modern'] },
      { value: 'fab', count: 1, lines: [15], warcTargetUri: retainedUri, families: ['modern'] },
    ]);
    expect(result.escapes).toEqual([
      { value: '\\f111', count: 2, lines: [7, 23], warcTargetUri: excludedUri },
      { value: '\\f111', count: 1, lines: [15], warcTargetUri: retainedUri },
    ]);
  });

  it('includes URIs in flattened archives without an ignore configuration', () => {
    const content = (warcRecord(excludedUri, 'fab \\f111') + warcRecord(retainedUri, 'far \\f222'))
      .replace(/\r/g, '').replace(/\n\n/g, '\n');
    const result = faUsageDetector(content);
    expect(result.classes).toMatchObject([
      { value: 'fab', warcTargetUri: excludedUri },
      { value: 'far', warcTargetUri: retainedUri },
    ]);
    expect(result.escapes).toMatchObject([
      { value: '\\f111', warcTargetUri: excludedUri },
      { value: '\\f222', warcTargetUri: retainedUri },
    ]);
  });

  it('ignores webfont filenames in archive URLs, requests and CSS without ignoring real classes', () => {
    const uri = 'https://pro.example.test/webfonts/fa-light-300.eot';
    const body = [
      'GET /webfonts/fa-light-300.eot HTTP/1.1',
      'src: url("/webfonts/fa-regular-400.woff2?v=1");',
      'src: url(fas-font.TTF);',
      'GET /webfonts/fa-brands-400.svg#font HTTP/1.1',
      '<i class="fa-light fab"></i>',
    ].join('\n');
    const result = faUsageDetector(warcRecord(uri, body));
    expect(result.classes).toMatchObject([
      { value: 'fa-light', count: 1, warcTargetUri: uri },
      { value: 'fab', count: 1, warcTargetUri: uri },
    ]);
  });

  it('does not count the supplied webfont request paths as class usage', () => {
    const uri = 'https://pro.fontawesome.com/releases/v5.15.4/webfonts/fa-light-300.eot';
    const body = 'GET /releases/v5.15.4/webfonts/fa-light-300.eot HTTP/1.1';
    expect(faUsageDetector(warcRecord(uri, body)).classes).toEqual([]);
    expect(faUsageDetector(warcRecord(uri.replace('.eot', '.svg'), body.replace('.eot', '.svg'))).classes).toEqual([]);
  });

  it('does not attribute matches outside records or in records without target URIs', () => {
    const record = warcRecord(excludedUri, 'far').replace(`WARC-Target-URI: ${excludedUri}\r\n`, '');
    const result = faUsageDetector(`fab\n${record}`);
    expect(result.classes).toEqual([
      { value: 'fab', count: 1, lines: [1], families: ['modern'] },
      { value: 'far', count: 1, lines: [7], families: ['modern'] },
    ]);
  });

  it('matches basename globs across directories and query strings', () => {
    const records = [
      warcRecord('https://example.test/a/b/icons.css?v=1', 'fab'),
      warcRecord('https://other.test/main.css', 'fas'),
      warcRecord('https://example.test/index.html', 'far'),
    ].join('');
    const result = faUsageDetector(records, undefined, { ignoreWarcTargetUris: ['*.css'] });
    expect(result.classes.map((match) => match.value)).toEqual(['far']);
    expect(result.skippedWarcTargetUris).toEqual([
      'https://example.test/a/b/icons.css?v=1',
      'https://other.test/main.css',
    ]);
  });

  it('supports path, globstar, character and brace patterns without overmatching', () => {
    const records = [
      warcRecord('https://example.test/assets/a/font1.css', 'fab'),
      warcRecord('https://example.test/assets/font2.js', 'fas'),
      warcRecord('https://example.test/other/font3.css', 'fad'),
      warcRecord('https://example.test/assets/a/font4.html', 'far'),
    ].join('');
    const result = faUsageDetector(records, undefined, {
      ignoreWarcTargetUris: ['https://example.test/assets/**/font[12].{css,js}'],
    });
    expect(result.skippedWarcTargetUris).toEqual([
      'https://example.test/assets/a/font1.css',
      'https://example.test/assets/font2.js',
    ]);
    expect(result.classes.map((match) => match.value)).toEqual(['fad', 'far']);
  });

  it('keeps exact URI query strings exact', () => {
    const first = `${excludedUri}?v=1`;
    const second = `${excludedUri}?v=2`;
    const result = faUsageDetector(warcRecord(first, 'fab') + warcRecord(second, 'far'), undefined, {
      ignoreWarcTargetUris: [first],
    });
    expect(result.skippedWarcTargetUris).toEqual([first]);
    expect(result.classes.map((match) => match.value)).toEqual(['far']);
  });

    it('uses content length even if a body contains a WARC-like marker', () => {
      const embedded = warcRecord(retainedUri, 'fab');
      const result = faUsageDetector(
        warcRecord(excludedUri, `body\n${embedded}\nfas`) + warcRecord(retainedUri, 'far'),
        undefined,
        { ignoreWarcTargetUris: [excludedUri] },
      );
      expect(result.classes.map((match) => match.value)).toEqual(['far']);
    });

    it('handles flattened text archives and repeated targets', () => {
      const flattened = [
        warcRecord(excludedUri, 'fab \\f111'),
        warcRecord(retainedUri, 'far \\f222'),
        warcRecord(excludedUri, 'fas \\f333'),
      ].join('').replace(/\r/g, '').replace(/\n\n/g, '\n');
      const result = faUsageDetector(flattened, undefined, { ignoreWarcTargetUris: [excludedUri] });
      expect(result.classes.map((match) => match.value)).toEqual(['far']);
      expect(result.escapes.map((match) => match.value)).toEqual(['\\f222']);
      expect(result.skippedWarcTargetUris).toEqual([excludedUri]);
    });

    it('rejects truncated standard records when exclusions are enabled', () => {
      const record = warcRecord(excludedUri, 'fab').replace('Content-Length: 3', 'Content-Length: 9999');
      expect(() => faUsageDetector(record, undefined, { ignoreWarcTargetUris: [excludedUri] }))
        .toThrow('Truncated WARC record');
    });

  it('reads plain and gzip-compressed files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fa-usage-detector-'));
    const plainPath = join(directory, 'icons.html');
    const gzipPath = join(directory, 'archive.txt.gz');
    const content = '<i class="far fa-heart"></i>';

    try {
      await writeFile(plainPath, content);
      await writeFile(gzipPath, gzipSync(content));

      expect(await faUsageDetectorFile(plainPath)).toMatchObject({
        source: plainPath,
        classes: [
          { value: 'far', count: 1, families: ['modern'] },
          { value: 'fa', count: 1, families: ['legacy'] },
        ],
      });
      expect(await faUsageDetectorFile(gzipPath)).toMatchObject({
        source: gzipPath,
        classes: [
          { value: 'far', count: 1, families: ['modern'] },
          { value: 'fa', count: 1, families: ['legacy'] },
        ],
      });

      let output = '';
      const exitCode = await runFaUsageDetectorCli(
        ['--json', plainPath],
        { write: (chunk: string) => { output += chunk; return true; } },
        { write: () => true },
      );
      expect(exitCode).toBe(0);
      expect(JSON.parse(output)).toMatchObject([
        { source: plainPath, classes: [{ value: 'far' }, { value: 'fa' }] },
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('loads CLI config and reports config errors', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fa-usage-config-'));
    try {
      const archive = join(directory, 'archive.txt.gz');
      const config = join(directory, 'config.json');
      await writeFile(archive, gzipSync(warcRecord(excludedUri, 'fab') + warcRecord(retainedUri, 'far')));
      await writeFile(config, JSON.stringify({ ignoreWarcTargetUris: ['font*.css'] }));
      let output = '';
      let errors = '';
      const out = { write: (chunk: string) => { output += chunk; return true; } };
      const err = { write: (chunk: string) => { errors += chunk; return true; } };
      expect(await runFaUsageDetectorCli(['--json', '--config', config, archive], out, err)).toBe(0);
      expect(JSON.parse(output)).toMatchObject([{
        classes: [{ value: 'far', warcTargetUri: retainedUri }],
        skippedWarcTargetUris: [excludedUri],
      }]);
      output = '';
      expect(await runFaUsageDetectorCli(['--config', config, archive], out, err)).toBe(0);
      expect(output).toContain(`WARC-Target-URI: ${retainedUri}`);
      await writeFile(config, '{"ignoreWarcTargetUris":"bad"}');
      expect(await runFaUsageDetectorCli(['--config', config, archive], out, err)).toBe(1);
      expect(errors).toContain('ignoreWarcTargetUris must be an array');
      expect(await runFaUsageDetectorCli(['--config'], out, err)).toBe(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses original byte lengths when an archive contains non-UTF-8 data', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fa-usage-bytes-'));
    try {
      const archive = join(directory, 'archive.txt.gz');
      const body = Buffer.from([0xff, 0x66, 0x61, 0x62]);
      const header = `WARC/1.0\r\nWARC-Type: response\r\nWARC-Record-ID: <urn:uuid:test>\r\nWARC-Target-URI: ${excludedUri}\r\nContent-Length: ${body.length}\r\n\r\n`;
      await writeFile(archive, gzipSync(Buffer.concat([
        Buffer.from(header), body, Buffer.from('\r\n\r\n' + warcRecord(retainedUri, 'far')),
      ])));
      const result = await faUsageDetectorFile(archive, { ignoreWarcTargetUris: [excludedUri] });
      expect(result.classes.map((match) => match.value)).toEqual(['far']);
      expect(result.skippedWarcTargetUris).toEqual([excludedUri]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
