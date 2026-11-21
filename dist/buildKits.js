import { exec } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import { GQLClient } from "./GQLClient.client.js";
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
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
async function main() {
    const flags = parseArgs(process.argv.slice(2));
    const previousFailures = await readPreviousFailures();
    const packaged = await readPackagedKitTokens();
    const gql = new GQLClient(FA_API_TOKEN);
    const kits = await gql.getKits();
    const installed = [];
    const failed = [];
    for (const kit of kits) {
        const previousReason = previousFailures.get(kit.token);
        const retried = flags.retry.has(kit.token) || flags.retry.has(kit.name);
        if (packaged.has(kit.token) && !flags.update) {
            try {
                console.log(`Already installed ${kit.name} (${kit.token}), copying icons`);
                const dist = await copyInstalledKit(kit);
                installed.push({ ...kitResult(kit), dist });
            }
            catch (err) {
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
        }
        catch (err) {
            const reason = installFailure(err);
            failed.push({ ...kitResult(kit), reason });
            console.error(`Failed ${kit.name} (${kit.token}): ${reason}`);
        }
    }
    await mkdir(distDir, { recursive: true });
    await writeFile(resultsPath, `${JSON.stringify({ installed, not_installed: failed }, null, 2)}\n`);
    console.log(`\nInstalled ${installed.length}:`);
    for (const kit of installed)
        console.log(`- ${kit.name} (${kit.token}) -> ${kit.dist}`);
    console.log(`\nFailed ${failed.length}:`);
    for (const kit of failed)
        console.log(`- ${kit.name} (${kit.token}): ${kit.reason}`);
}
function parseArgs(argv) {
    const flags = { force: false, update: false, retry: new Set() };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--force') {
            flags.force = true;
        }
        else if (arg === '--update') {
            flags.update = true;
        }
        else if (arg === '--retry' || arg.startsWith('--retry=')) {
            const value = arg === '--retry' ? argv[++i] : arg.slice('--retry='.length);
            if (!value) {
                console.error('Expected a kit token or name after --retry');
                process.exit(1);
            }
            for (const id of value.split(',')) {
                const trimmed = id.trim();
                if (trimmed)
                    flags.retry.add(trimmed);
            }
        }
        else {
            console.error(`Unknown argument: ${arg}`);
            process.exit(1);
        }
    }
    return flags;
}
async function readPreviousFailures() {
    let raw;
    try {
        raw = await readFile(resultsPath, 'utf8');
    }
    catch (err) {
        if (isEnoent(err))
            return new Map();
        throw err;
    }
    const data = JSON.parse(raw);
    const failures = new Map();
    for (const item of data.not_installed ?? []) {
        if (item.token)
            failures.set(item.token, item.reason ?? 'previous failure');
    }
    return failures;
}
async function readPackagedKitTokens() {
    const raw = await readFile(path.join(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(raw);
    const tokens = new Set();
    for (const name of Object.keys(pkg.dependencies ?? {})) {
        if (name.startsWith(kitPackagePrefix))
            tokens.add(name.slice(kitPackagePrefix.length));
    }
    return tokens;
}
async function installKit(kit) {
    console.log(`Installing kit ${kit.name} (${kit.token})`);
    const { stdout, stderr } = await execAsync(`FONTAWESOME_PACKAGE_TOKEN=${FA_PKG_TOKEN} npm install --save '${kitPackagePrefix}${kit.token}@latest'`, {
        cwd: process.cwd()
    });
    if (stdout)
        console.log(stdout);
    if (stderr)
        console.error(stderr);
    console.log('Done.');
}
export async function copyInstalledKit(kit) {
    const versionKey = kitVersionKey(kit.version);
    const icons = path.join(process.cwd(), 'node_modules', '@awesome.me', `kit-${kit.token}`, 'icons');
    await mergeSharedAssets(icons, versionKey);
    return writeKitStylesheets(icons, kit.token, versionKey);
}
function kitVersionKey(version) {
    if (/^\d+\.\d+\.\d+$/.test(version))
        return version;
    if (version === 'latest')
        return '5';
    const major = version.split('.')[0];
    return /^\d+$/.test(major) ? major : '0';
}
async function mergeSharedAssets(icons, versionKey) {
    const shared = path.join(distDir, 'fa-versions', versionKey);
    await mergeDir(path.join(icons, 'webfonts'), path.join(shared, 'webfonts'));
    await mergeDir(path.join(icons, 'css'), path.join(shared, 'css'), (name) => !name.startsWith('all'));
}
async function mergeDir(source, dest, include = () => true) {
    let entries;
    try {
        entries = await readdir(source, { withFileTypes: true });
    }
    catch (err) {
        if (isEnoent(err))
            return;
        throw err;
    }
    await mkdir(dest, { recursive: true });
    for (const entry of entries) {
        if (!include(entry.name))
            continue;
        const from = path.join(source, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory())
            await mergeDir(from, to);
        else if (entry.isFile())
            await cp(from, to);
    }
}
async function writeKitStylesheets(icons, token, versionKey) {
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
function rewriteStylesheetPaths(css, versionKey) {
    return css.replaceAll('../webfonts/', `../fa-versions/${versionKey}/webfonts/`);
}
function kitResult(kit) {
    return {
        name: kit.name,
        token: kit.token,
        version: kit.version,
        major: kit.major,
        licenseSelected: kit.licenseSelected,
    };
}
function installFailure(err) {
    if (err && typeof err === 'object' && 'stderr' in err && typeof err.stderr === 'string' && err.stderr.trim()) {
        const lines = err.stderr.trim().split('\n').filter(Boolean);
        return lines[lines.length - 1];
    }
    if (err instanceof Error)
        return err.message;
    return String(err);
}
function isEnoent(err) {
    return !!err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT';
}
//# sourceMappingURL=buildKits.js.map