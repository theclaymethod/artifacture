#!/usr/bin/env node
import { runVerify } from './lib/engine.mjs';
import { printHumanReport, writeJsonReport } from './lib/report.mjs';

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  if (!options.file) {
    console.error('Usage: node plugins/visual-explainer/scripts/verify/ve-verify.mjs <file.html> [--profile page|slides|magazine|poster|video-comp] [--preset mono-industrial|nothing|blueprint|editorial|paper-ink|terminal|ide|custom] [--json out.json] [--screens dir] [--static-only] [--quiet]');
    process.exit(2);
  }

  try {
    const report = await runVerify(options.file, options);
    if (options.json) await writeJsonReport(report, options.json);
    printHumanReport(report, options);
    process.exit(report.summary.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error(`ve-verify crashed: ${error.stack || error.message}`);
    process.exit(2);
  }
}

function parseArgs(args) {
  const options = { staticOnly: false, quiet: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--profile') options.profile = args[++i];
    else if (arg === '--preset') options.preset = args[++i];
    else if (arg === '--json') options.json = args[++i];
    else if (arg === '--screens') options.screens = args[++i];
    else if (arg === '--static-only') options.staticOnly = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (!options.file) options.file = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return options;
}

main();
