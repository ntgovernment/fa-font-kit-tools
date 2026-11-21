import { exec } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
let FA_API_TOKEN = process?.env?.FA_API_TOKEN;
let FA_PKG_TOKEN = process?.env?.FA_PKG_TOKEN;
if (![FA_API_TOKEN, FA_PKG_TOKEN].every(Boolean)) {
  dotenv.config();
  FA_API_TOKEN = process?.env?.FA_API_TOKEN;
  FA_PKG_TOKEN = process?.env?.FA_PKG_TOKEN;
}
if (![FA_API_TOKEN, FA_PKG_TOKEN].every(Boolean)) {
    console.error('Excpected env var: FA_API_TOKEN');
    process?.exit(1);
}

// run
main();

async function main() {
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

async function copyInstalledKit(kit: FAKitExtended): Promise<string> {
  const source = path.join(process.cwd(), 'node_modules', '@awesome.me', `kit-${kit.token}`, 'icons');
  const dest = path.join(distDir, `kit-${kit.token}`);
  await rm(dest, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await cp(source, dest, { recursive: true });
  return path.relative(process.cwd(), dest);
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
