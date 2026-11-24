import type { ReviewSurface } from '@artifacture/verify';
import { runInit } from './commands/init.ts';
import { runDocs, runInfo, runList, runSkills } from './commands/inspect.ts';
import {
  runCheck,
  runPlaygroundStatus,
  runReviewCli,
  runShaders,
  runStills,
} from './commands/pipeline.ts';

export { GPU_SCENE_CATALOG, getFullCatalog, TEMPLATE_CATALOG } from './catalog.ts';
export { runInit } from './commands/init.ts';
export { runDocs, runInfo, runList, runSkills } from './commands/inspect.ts';
export {
  runCheck,
  runPlaygroundStatus,
  runReviewCli,
  runShaders,
  runStills,
} from './commands/pipeline.ts';

export interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function getFlagValue(args: readonly string[], name: string): string | undefined {
  const eqPrefix = `${name}=`;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === name && i + 1 < args.length) return args[i + 1];
    if (arg.startsWith(eqPrefix)) return arg.slice(eqPrefix.length);
  }
  return undefined;
}

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

function positionalArgs(args: readonly string[], valueFlags: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const flagName = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
      if (!arg.includes('=') && valueFlags.has(flagName)) {
        i += 1;
      }
      continue;
    }
    out.push(arg);
  }
  return out;
}

const HELP_TEXT = [
  'artifacture — Artifacture v2 CLI',
  '',
  'Usage:',
  '  artifacture init <slides|explainer|video> [dir]',
  '  artifacture list [--json]',
  '  artifacture info <id> [--json]',
  '  artifacture docs [overview|slides|explainer|video|gpu|playground|list]',
  '  artifacture shaders [dir] [--emit] [--json]',
  '  artifacture stills [dir]',
  '  artifacture check [dir] [--json]',
  '  artifacture review <url> --surface <slides|explainer|video> [--pages 1,2] [--all] [--out dir] [--seek 0,1.5,0] [--no-webgpu]',
  '  artifacture playground status [--repo path] [--json]',
  '  artifacture skills [install-dir]',
].join('\n');

const VALUE_FLAGS = new Set(['--surface', '--pages', '--out', '--seek', '--repo']);

export async function runCli(argv: readonly string[]): Promise<CliResult> {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    return { exitCode: 0, stdout: HELP_TEXT, stderr: '' };
  }

  const json = hasFlag(rest, '--json');
  const pos = positionalArgs(rest, VALUE_FLAGS);

  try {
    switch (command) {
      case 'init':
        return { exitCode: 0, stdout: await runInit(pos[0], pos[1]), stderr: '' };
      case 'list':
        return { exitCode: 0, stdout: runList(json), stderr: '' };
      case 'info':
        return { exitCode: 0, stdout: runInfo(pos[0], json), stderr: '' };
      case 'docs':
        return { exitCode: 0, stdout: await runDocs(pos[0] ?? 'overview'), stderr: '' };
      case 'shaders':
        return {
          exitCode: 0,
          stdout: await runShaders(pos[0] ?? '.', hasFlag(rest, '--emit'), json),
          stderr: '',
        };
      case 'stills':
        return { exitCode: 0, stdout: await runStills(pos[0] ?? '.'), stderr: '' };
      case 'check': {
        const res = await runCheck(pos[0] ?? '.', json);
        return { exitCode: res.ok ? 0 : 1, stdout: res.output, stderr: '' };
      }
      case 'review': {
        const url = pos[0];
        const surface = getFlagValue(rest, '--surface') as ReviewSurface | undefined;
        if (!url || (surface !== 'slides' && surface !== 'explainer' && surface !== 'video')) {
          throw new Error(
            'Usage: artifacture review <url> --surface <slides|explainer|video> [--pages 1,2] [--all] [--out dir]',
          );
        }
        const pagesRaw = getFlagValue(rest, '--pages');
        const pages = pagesRaw
          ? pagesRaw
              .split(',')
              .map((v) => Number.parseInt(v.trim(), 10))
              .filter(Number.isFinite)
          : undefined;
        const seekRaw = getFlagValue(rest, '--seek');
        const seekTimes = seekRaw
          ? seekRaw
              .split(',')
              .map((v) => Number.parseFloat(v.trim()))
              .filter(Number.isFinite)
          : undefined;

        const res = await runReviewCli({
          url,
          surface,
          outDir: getFlagValue(rest, '--out'),
          pages,
          allPages: hasFlag(rest, '--all'),
          seekTimes,
          expectWebGpu: !hasFlag(rest, '--no-webgpu'),
        });
        return { exitCode: res.ok ? 0 : 1, stdout: res.output, stderr: '' };
      }
      case 'playground': {
        if (pos[0] !== 'status') {
          throw new Error('Usage: artifacture playground status [--repo path] [--json]');
        }
        return {
          exitCode: 0,
          stdout: await runPlaygroundStatus(getFlagValue(rest, '--repo'), json),
          stderr: '',
        };
      }
      case 'skills':
        return { exitCode: 0, stdout: await runSkills(pos[0]), stderr: '' };
      default:
        return { exitCode: 1, stdout: '', stderr: `Unknown command "${command}".\n\n${HELP_TEXT}` };
    }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
    };
  }
}
