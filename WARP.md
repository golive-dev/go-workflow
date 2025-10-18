# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Common commands

- Install deps: `npm ci`
- Build (library + CLI): `npm run build`
- Watch build (tsup): `npm run dev`
- Type-check: `npm run type-check`
- Lint: `npm run lint`
- Lint (auto-fix): `npm run lint:fix`
- Run tests: `npm test`
- Watch tests: `npm run test:watch`
- Coverage: `npm run test:coverage`
- Clean artifacts: `npm run clean`

Single-test examples (Vitest):
- By file: `npm test -- tests/unit/git.test.ts`
- By name pattern: `npm test -- -t "version bump"`
- File + name: `npm test -- tests/unit/changelog.test.ts -t "Changelog"`

Run the CLI locally (after build):
- Main entry: `node dist/cli/index.cjs <command>`
- Examples: `node dist/cli/index.cjs release`, `node dist/cli/index.cjs deploy`, `node dist/cli/index.cjs feature`

Node version: requires Node >= 18.

## High-level architecture

This is a TypeScript library and CLI for release automation, changeloging, Git/GitHub ops, npm publishing, and deployments. It outputs ESM modules for library consumers and CJS executables for the CLI.

- Build and packaging
  - Bundled by tsup per tsup.config.ts.
    - ESM library bundles under `dist/**` with type declarations.
    - CJS CLI bundles with shebang: `dist/cli/*.cjs` (wired via package.json `bin`).
  - Scripts: `build`, `dev` (watch), `prepublishOnly` chain includes clean/build/typecheck/lint.

- CLI (src/cli)
  - Built with commander; main entry `src/cli/index.ts` registers subcommands:
    - `release`: orchestrates tests, version bump selection/detection, changelog, tagging, pushes, optional GitHub release and npm publish.
    - `feature`: designed for feature-branch releases with PR automation and optional auto-merge.
    - `deploy`: runs configured deployment targets sequentially or in parallel; parses URLs from logs.
    - `init`: interactively scaffolds `.go-workflow.config.js`.
    - `config`: show/edit current configuration.
    - `status`: shows repo/CLI/config status.

- Orchestration (src/index.ts)
  - Exposes `Workflow` class with `executeRelease` and helpers, plus `createWorkflow`/`quickRelease`.
  - Coordinates modules: Git operations, changelog manager, GitHub integration; updates `package.json`, writes `CHANGELOG.md`, commits, tags, and pushes.

- Core modules
  - Config (src/config): Loads config from files (`.go-workflow.config.{js,mjs,ts}`, `go-workflow.config.*`, `.go-workflowrc.{js,mjs,json}`), merges with package.json `go-workflow` section and env vars; provides defaults and validation.
  - Git (src/git): Wrapper around simple-git and child processes to read/update `package.json` version, stage/commit, push, tag, diff, analyze conventional commits to recommend semver bump.
  - Changelog (src/changelog): Parses commits into sections, maintains `CHANGELOG.md` with an "Unreleased" section, inserts new version entries.
  - GitHub (src/github): Uses `gh` CLI to create PRs, enable auto-merge, create releases, query repo/workflow status, wait for workflows.
  - NPM (src/npm): Uses `npm` CLI to build/test/publish, check published versions, and manage tags/access; supports dry-run and registry overrides.
  - Deploy (src/deploy): Executes configured commands per deployment target (Cloudflare Workers, Vercel, Netlify, AWS, Heroku, custom), sequentially or in parallel; extracts deployment URLs from logs; basic rollback hooks for some targets.
  - Utils (src/utils): Logging, spinners, timers, formatting, retry/backoff, helpers.

- Testing and quality
  - Vitest configured in `vitest.config.ts` with global thresholds, setup in `tests/setup.ts` (mocks for execa/simple-git), and unit tests under `tests/unit`.
  - ESLint config in `.eslintrc.cjs`; TypeScript config in `tsconfig.json`.

- Configuration precedence
  1) Explicit config files in project root (see list above)
  2) `package.json` `go-workflow` field
  3) Environment variables (e.g., `GO_WORKFLOW_AUTO_RELEASE`, `GO_WORKFLOW_AUTO_MERGE`, `GO_WORKFLOW_AUTO_PUBLISH`, `NPM_REGISTRY`)
  4) Built-in defaults in `src/config`.

External tooling expectations:
- Git repository present; `gh` CLI installed and authenticated for GitHub features; `npm` configured for publish where applicable.
