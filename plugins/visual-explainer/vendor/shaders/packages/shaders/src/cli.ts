// Shaders CLI — bundled to dist/cli.js by scripts/build.ts and exposed via the
// package.json "bin" field, so `npx shaders <command>` works out of the box.
//
//   connect/init   set up Shaders in a project (src/cli/init.ts)
//   install/update fetch shader component files into the project (src/cli/install.ts, update.ts)
//   login/logout   manage the stored shaders.com sign-in (src/cli/auth.ts)
//   install-mcp    add the Shaders MCP server to coding agents (src/cli/installMcp.ts)
import { consola } from 'consola'
import { getApiUrl } from './cli/api'
import { clearCredentials, ensureSignedIn } from './cli/auth'
import { fail } from './cli/fail'
import { init, type InitFlags } from './cli/init'
import { install, type InstallFlags } from './cli/install'
import { open } from './cli/open'
import { update } from './cli/update'
import { getHttpAgentTypes, installMcp, MCP_DOCS_URL, uninstallMcp, type McpFlags } from './cli/installMcp'

// Injected by esbuild at build time
declare const __SHADERS_CLI_VERSION__: string

interface Flags extends McpFlags, InitFlags, InstallFlags {}

function printHelp() {
  console.log(`shaders — Shaders CLI (https://shaders.com)

Usage:
  npx shaders connect [options]        Set up Shaders in this project and connect it to your account
  npx shaders init [options]           Alias for connect
  npx shaders install [<ref>...]       Install shaders: your own by id, presets by name (offsets-1) — no ref: pick from your project
  npx shaders i [<ref>...]             Alias for install
  npx shaders update [<id>...]         Refresh installed shaders (all of them when no id is given)
  npx shaders open                     Open the connected project in the design editor
  npx shaders login                    Sign in to your Shaders account
  npx shaders logout                   Forget the stored sign-in
  npx shaders install-mcp [options]    Add the Shaders MCP server to your coding agents
  npx shaders uninstall-mcp [options]  Remove the Shaders MCP server from your coding agents

connect options:
  -f, --framework <name>   Override detection: react, vue, svelte or solid
  -p, --project <id>       Connect to a specific shaders.com project (non-interactive)
      --no-install         Don't install the shaders package
      --no-auth            Skip sign-in and project connection
  -y, --yes                Skip prompts (no project is connected unless --project is given)

install / update options:
      --all                Install every shader in the connected project without prompting
      --force              Overwrite files that exist or have local edits

install-mcp options:
  -a, --agent <name>       Target specific agent(s), repeatable (e.g. -a cursor -a claude-code)
  -g, --global             Use global (user-level) config instead of project config
  -y, --yes                Skip prompts and use auto-detected agents

General:
  -h, --help               Show this help
  -v, --version            Show version

Supported agents:
  ${getHttpAgentTypes().join(', ')}

Docs: ${MCP_DOCS_URL}`)
}

function parseArgs(argv: string[]): { command?: string, args: string[], flags: Flags } {
  const flags: Flags = { global: false, yes: false, agents: [], auth: true, install: true, force: false, all: false }
  let command: string | undefined
  const args: string[] = []

  const value = (arg: string, i: number): string => {
    const v = argv[i]
    if (!v || v.startsWith('-')) fail(`Missing value for ${arg}`)
    return v
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '-g':
      case '--global':
        flags.global = true
        break
      case '-y':
      case '--yes':
        flags.yes = true
        break
      case '--no-auth':
        flags.auth = false
        break
      case '--no-install':
        flags.install = false
        break
      case '--force':
        flags.force = true
        break
      case '--all':
        flags.all = true
        break
      case '-a':
      case '--agent':
        flags.agents.push(...value(arg, ++i).split(',').map(s => s.trim()).filter(Boolean))
        break
      case '-f':
      case '--framework':
        flags.framework = value(arg, ++i)
        break
      case '-p':
      case '--project':
        flags.project = value(arg, ++i)
        break
      case '-h':
      case '--help':
        printHelp()
        process.exit(0)
        break
      case '-v':
      case '--version':
        console.log(__SHADERS_CLI_VERSION__)
        process.exit(0)
        break
      default:
        if (arg.startsWith('-')) fail(`Unknown option: ${arg} (see npx shaders --help)`)
        if (command) args.push(arg)
        else command = arg
    }
  }

  return { command, args, flags }
}

async function login() {
  const { me } = await ensureSignedIn()
  consola.success(`Signed in to ${getApiUrl()}${me.email ? ` as ${me.email}` : ''}`)
}

async function logout() {
  const removed = await clearCredentials()
  consola.success(removed ? 'Signed out — stored credentials removed' : 'No stored credentials found')
}

async function main() {
  const { command, args, flags } = parseArgs(process.argv.slice(2))
  const noArgs = () => {
    if (args.length) fail(`Unexpected argument: ${args[0]}`)
  }

  switch (command) {
    case 'connect':
    case 'init':
      noArgs()
      await init(flags)
      break
    case 'install':
    case 'i':
      await install(args, flags)
      break
    case 'open':
      noArgs()
      await open()
      break
    case 'update':
      await update(args, flags)
      break
    case 'login':
      noArgs()
      await login()
      break
    case 'logout':
      noArgs()
      await logout()
      break
    case 'install-mcp':
      noArgs()
      await installMcp(flags)
      break
    case 'uninstall-mcp':
      noArgs()
      await uninstallMcp(flags)
      break
    case undefined:
    case 'help':
      printHelp()
      break
    default:
      fail(`Unknown command "${command}" (see npx shaders --help)`)
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})
