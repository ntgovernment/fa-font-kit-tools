import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import { FontawesomeGraphQL, FAKitExtended } from "./FontawesomeGraphQL.client.js";

const execAsync = promisify(exec);
const kitPackagePrefix = '@awesome.me/kit-';
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
  const gql = new FontawesomeGraphQL(FA_API_TOKEN!);
  const kits = await gql.getKits();
  const installed: FAKitExtended[] = [];
  const failed: { kit: FAKitExtended; reason: string }[] = [];

  for (const kit of kits) {
    try {
      await installKit(kit);
      installed.push(kit);
    } catch (err) {
      const reason = installFailure(err);
      failed.push({ kit, reason });
      console.error(`Failed ${kit.name} (${kit.token}): ${reason}`);
    }
  }

  console.log(`\nInstalled ${installed.length}:`);
  for (const kit of installed) console.log(`- ${kit.name} (${kit.token})`);

  console.log(`\nFailed ${failed.length}:`);
  for (const { kit, reason } of failed) console.log(`- ${kit.name} (${kit.token}): ${reason}`);
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

function installFailure(err: unknown): string {
  if (err && typeof err === 'object' && 'stderr' in err && typeof err.stderr === 'string' && err.stderr.trim()) {
    const lines = err.stderr.trim().split('\n').filter(Boolean);
    return lines[lines.length - 1];
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
