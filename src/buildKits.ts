import { exec } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import { GQLClient, FAKitExtended } from "./GQLClient.client.js";

interface InstalledKit {
  name: string;
  token: string;
  version: string;
  major: number;
  licenseSelected: string;
  dist: string;
}

interface FailedKit {
  name: string;
  token: string;
  version: string;
  major: number;
  licenseSelected: string;
  reason: string;
}

interface RunFlags {
  force: boolean;
  update: boolean;
  retry: Set<string>;
}

const execAsync = promisify(exec);
const kitPackagePrefix = '@awesome.me/kit-';
const distDir = path.join(process.cwd(), 'dist');
const resultsPath = path.join(distDir, 'kit-results.json');
const versionsPath = path.join(distDir, 'kit-versions.json');
let FA_API_TOKEN = process?.env?.FA_API_TOKEN;
let FA_PKG_TOKEN = process?.env?.FA_PKG_TOKEN;

export interface KitVersionRecord {
  [major: string]: string[];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

async function main() {
  loadTokens();
  if (![FA_API_TOKEN, FA_PKG_TOKEN].every(Boolean)) {
    console.error('Excpected env var: FA_API_TOKEN');
    process.exit(1);
  }
  const flags = parseArgs(process.argv.slice(2));
  const previousFailures = await readPreviousFailures();
  const packaged = await readPackagedKitTokens();
  const gql = new GQLClient(FA_API_TOKEN!);
  const kits = await gql.getKits();
  const installed: InstalledKit[] = [];
  const failed: FailedKit[] = [];

  for (const kit of kits) {
    const previousReason = previousFailures.get(kit.token);
    const retried = flags.retry.has(kit.token) || flags.retry.has(kit.name);

    if (packaged.has(kit.token) && !flags.update) {
      try {
        console.log(`Already installed ${kit.name} (${kit.token}), copying icons`);
        const dist = await copyInstalledKit(kit);
        installed.push({ ...kitResult(kit), dist });
      } catch (err) {
        const reason = installFailure(err);
        failed.push({ ...kitResult(kit), reason });
        console.error(`Failed ${kit.name} (${kit.token}): ${reason}`);
      }
      continue;
    }

    if (previousReason && !flags.force && !retried) {
      failed.push({ ...kitResult(kit), reason: previousReason });
      console.log(`Skipping ${kit.name} (${kit.token}): previous failure`);
      continue;
    }

    try {
      await installKit(kit);
      const dist = await copyInstalledKit(kit);
      installed.push({ ...kitResult(kit), dist });
    } catch (err) {
      const reason = installFailure(err);
      failed.push({ ...kitResult(kit), reason });
      console.error(`Failed ${kit.name} (${kit.token}): ${reason}`);
    }
  }

  await mkdir(distDir, { recursive: true });
  await writeFile(resultsPath, `${JSON.stringify({ installed, not_installed: failed }, null, 2)}\n`);

  console.log(`\nInstalled ${installed.length}:`);
  for (const kit of installed) console.log(`- ${kit.name} (${kit.token}) -> ${kit.dist}`);

  console.log(`\nFailed ${failed.length}:`);
  for (const kit of failed) console.log(`- ${kit.name} (${kit.token}): ${kit.reason}`);
}

function parseArgs(argv: string[]): RunFlags {
  const flags: RunFlags = { force: false, update: false, retry: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') {
      flags.force = true;
    } else if (arg === '--update') {
      flags.update = true;
    } else if (arg === '--retry' || arg.startsWith('--retry=')) {
      const value = arg === '--retry' ? argv[++i] : arg.slice('--retry='.length);
      if (!value) {
        console.error('Expected a kit token or name after --retry');
        process.exit(1);
      }
      for (const id of value.split(',')) {
        const trimmed = id.trim();
        if (trimmed) flags.retry.add(trimmed);
      }
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return flags;
}

async function readPreviousFailures(): Promise<Map<string, string>> {
  let raw: string;
  try {
    raw = await readFile(resultsPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return new Map();
    throw err;
  }
  const data = JSON.parse(raw) as { not_installed?: { token?: string; reason?: string }[] };
  const failures = new Map<string, string>();
  for (const item of data.not_installed ?? []) {
    if (item.token) failures.set(item.token, item.reason ?? 'previous failure');
  }
  return failures;
}

async function readPackagedKitTokens(): Promise<Set<string>> {
  const raw = await readFile(path.join(process.cwd(), 'package.json'), 'utf8');
  const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
  const tokens = new Set<string>();
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (name.startsWith(kitPackagePrefix)) tokens.add(name.slice(kitPackagePrefix.length));
  }
  return tokens;
}

async function installKit(kit: FAKitExtended) {
  console.log(`Installing kit ${kit.name} (${kit.token})`);
  const { stdout, stderr } = await execAsync(
    `FONTAWESOME_PACKAGE_TOKEN=${FA_PKG_TOKEN} npm install --save '${kitPackagePrefix}${kit.token}@latest'`,
    {
      cwd: process.cwd()
    });
  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);
  console.log('Done.');
}

export async function copyInstalledKit(kit: FAKitExtended): Promise<string> {
  const versionKey = kitVersionKey(kit.version);
  const icons = path.join(process.cwd(), 'node_modules', '@awesome.me', `kit-${kit.token}`, 'icons');
  await mergeSharedAssets(icons, versionKey);
  const dist = await writeKitStylesheets(icons, kit.token, versionKey);
  await recordKitVersion(kit.token, kit.version);
  return dist;
}

export function placeKitVersion(record: KitVersionRecord, token: string, version: string): KitVersionRecord {
  const major = majorVersionKey(version);
  const next: KitVersionRecord = {};
  for (const [key, tokens] of Object.entries(record)) {
    const remaining = tokens.filter((item) => item !== token);
    if (remaining.length > 0) next[key] = remaining;
  }
  next[major] = [...(next[major] ?? []), token].sort();
  return Object.fromEntries(
    Object.entries(next).sort(([a], [b]) => Number(a) - Number(b)),
  );
}

function majorVersionKey(version: string): string {
  if (version === 'latest') return '5';
  const major = version.split('.')[0];
  return /^\d+$/.test(major) ? major : '0';
}

function loadTokens() {
  if ([FA_API_TOKEN, FA_PKG_TOKEN].every(Boolean)) return;
  dotenv.config();
  FA_API_TOKEN = process?.env?.FA_API_TOKEN;
  FA_PKG_TOKEN = process?.env?.FA_PKG_TOKEN;
}

async function recordKitVersion(token: string, version: string) {
  const record = placeKitVersion(await readKitVersions(), token, version);
  await mkdir(distDir, { recursive: true });
  await writeFile(versionsPath, `${JSON.stringify(record, null, 2)}\n`);
}

async function readKitVersions(): Promise<KitVersionRecord> {
  try {
    const raw = await readFile(versionsPath, 'utf8');
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const record: KitVersionRecord = {};
    for (const [key, value] of Object.entries(data)) {
      if (!Array.isArray(value)) continue;
      record[key] = value.filter((item): item is string => typeof item === 'string');
    }
    return record;
  } catch (err) {
    if (isEnoent(err)) return {};
    throw err;
  }
}

function kitVersionKey(version: string): string {
  if (/^\d+\.\d+\.\d+$/.test(version)) return version;
  if (version === 'latest') return '5';
  const major = version.split('.')[0];
  return /^\d+$/.test(major) ? major : '0';
}

async function mergeSharedAssets(icons: string, versionKey: string) {
  const shared = path.join(distDir, 'fa-versions', versionKey);
  await mergeDir(path.join(icons, 'webfonts'), path.join(shared, 'webfonts'));
  await mergeDir(path.join(icons, 'css'), path.join(shared, 'css'), (name) => !name.startsWith('all'));
}

async function mergeDir(source: string, dest: string, include: (name: string) => boolean = () => true) {
  let entries;
  try {
    entries = await readdir(source, { withFileTypes: true });
  } catch (err) {
    if (isEnoent(err)) return;
    throw err;
  }
  await mkdir(dest, { recursive: true });
  for (const entry of entries) {
    if (!include(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await mergeDir(from, to);
    else if (entry.isFile()) await cp(from, to);
  }
}

async function writeKitStylesheets(icons: string, token: string, versionKey: string): Promise<string> {
  const dest = path.join(distDir, `kit-${token}`);
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  const cssDir = path.join(icons, 'css');
  const entries = await readdir(cssDir);
  for (const name of entries.filter((entry) => entry.startsWith('all'))) {
    const css = await readFile(path.join(cssDir, name), 'utf8');
    await writeFile(path.join(dest, name), rewriteStylesheetPaths(css, versionKey));
  }
  return path.relative(process.cwd(), dest);
}

function rewriteStylesheetPaths(css: string, versionKey: string): string {
  return css.replaceAll('../webfonts/', `../fa-versions/${versionKey}/webfonts/`);
}

function kitResult(kit: FAKitExtended) {
  return {
    name: kit.name,
    token: kit.token,
    version: kit.version,
    major: kit.major,
    licenseSelected: kit.licenseSelected,
  };
}

function installFailure(err: unknown): string {
  if (err && typeof err === 'object' && 'stderr' in err && typeof err.stderr === 'string' && err.stderr.trim()) {
    const lines = err.stderr.trim().split('\n').filter(Boolean);
    return lines[lines.length - 1];
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function isEnoent(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT';
}
