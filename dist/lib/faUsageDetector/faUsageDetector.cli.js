import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { faUsageDetectorFile } from './faUsageDetector.js';
const usage = `Usage: npm run fa-usage -- [--json] [--config <config.json>] <file...>

Scans CSS, HTML, and text files for Font Awesome class prefixes and CSS content escapes.
Files ending in .gz are decompressed before scanning.
The JSON config can specify an ignoreWarcTargetUris array of exact URIs or glob patterns.`;
async function readConfig(path) {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Config must be a JSON object');
    }
    const config = parsed;
    if (Object.keys(config).some((key) => key !== 'ignoreWarcTargetUris')) {
        throw new Error('Config contains an unknown option');
    }
    if (config.ignoreWarcTargetUris !== undefined && (!Array.isArray(config.ignoreWarcTargetUris)
        || !config.ignoreWarcTargetUris.every((uri) => typeof uri === 'string' && uri.length > 0))) {
        throw new Error('ignoreWarcTargetUris must be an array of non-empty strings');
    }
    return { ignoreWarcTargetUris: config.ignoreWarcTargetUris };
}
function formatResult(result) {
    const lines = [`File: ${result.source ?? '(input)'}`];
    const modern = result.classes.filter((match) => match.families.includes('modern'));
    const legacy = result.classes.filter((match) => match.families.includes('legacy'));
    const formatMatches = (matches) => matches.length === 0
        ? '  (none)'
        : matches
            .map((match) => `  ${match.value} (count: ${match.count}; lines: ${match.lines.join(', ')}${match.warcTargetUri !== undefined ? `; WARC-Target-URI: ${match.warcTargetUri}` : ''})`)
            .join('\n');
    lines.push('Modern class prefixes:', formatMatches(modern));
    lines.push('Legacy class prefixes:', formatMatches(legacy));
    lines.push('CSS content escapes:', formatMatches(result.escapes));
    if (result.skippedWarcTargetUris !== undefined) {
        lines.push('Skipped WARC target URIs:', result.skippedWarcTargetUris.length
            ? result.skippedWarcTargetUris.map((uri) => `  ${uri}`).join('\n')
            : '  (none)');
    }
    return lines.join('\n');
}
export async function runFaUsageDetectorCli(args = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr) {
    if (args.includes('--help') || args.includes('-h')) {
        stdout.write(`${usage}\n`);
        return 0;
    }
    let json = false;
    let configPath;
    const filePaths = [];
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--json') {
            json = true;
        }
        else if (arg === '--config') {
            const value = args[index + 1];
            if (!value || value.startsWith('-') || configPath !== undefined) {
                stderr.write('--config requires one config file path and may only be specified once.\n');
                return 2;
            }
            configPath = value;
            index += 1;
        }
        else if (arg.startsWith('-')) {
            stderr.write(`Unknown option: ${arg}\n`);
            return 2;
        }
        else {
            filePaths.push(arg);
        }
    }
    if (filePaths.length === 0) {
        stderr.write(`${usage}\n`);
        return 2;
    }
    let options = {};
    if (configPath !== undefined) {
        try {
            options = await readConfig(configPath);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            stderr.write(`Failed to load config "${configPath}": ${message}\n`);
            return 1;
        }
    }
    const results = [];
    let failed = false;
    for (const filePath of filePaths) {
        try {
            results.push(await faUsageDetectorFile(filePath, options));
        }
        catch (error) {
            failed = true;
            const message = error instanceof Error ? error.message : String(error);
            stderr.write(`Failed to scan "${filePath}": ${message}\n`);
        }
    }
    if (json) {
        stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    }
    else if (results.length > 0) {
        stdout.write(`${results.map(formatResult).join('\n\n')}\n`);
    }
    return failed ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    runFaUsageDetectorCli().then((exitCode) => {
        process.exitCode = exitCode;
    });
}
//# sourceMappingURL=faUsageDetector.cli.js.map