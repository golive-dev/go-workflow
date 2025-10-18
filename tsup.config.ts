import { defineConfig } from 'tsup'

export default defineConfig([
  // Library modules (ESM)
  {
    entry: {
      'index': 'src/index.ts',
      'git/index': 'src/git/index.ts',
      'changelog/index': 'src/changelog/index.ts',
      'github/index': 'src/github/index.ts',
      'npm/index': 'src/npm/index.ts',
      'deploy/index': 'src/deploy/index.ts',
      'config/index': 'src/config/index.ts',
      'utils/index': 'src/utils/index.ts',
    },
    format: ['esm'],
    target: 'node18',
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    minify: false,
    external: [
      'chalk',
      'commander',
      'enquirer',
      'execa',
      'fs-extra',
      'globby',
      'marked',
      'ora',
      'semver',
      'simple-git',
      'yaml',
    ],
    esbuildOptions(options) {
      options.conditions = ['node']
    },
  },
  // CLI executables (CommonJS with shebang)
  {
    entry: {
      'cli/index': 'src/cli/index.ts',
      'cli/release': 'src/cli/release.ts',
      'cli/feature': 'src/cli/feature.ts',
      'cli/deploy': 'src/cli/deploy.ts',
    },
    format: ['cjs'],
    target: 'node18',
    dts: false,
    splitting: false,
    sourcemap: false,
    minify: false,
    external: [
      'chalk',
      'commander',
      'enquirer',
      'execa',
      'fs-extra',
      'globby',
      'marked',
      'ora',
      'semver',
      'simple-git',
      'yaml',
    ],
    banner: {
      js: '#!/usr/bin/env node',
    },
    esbuildOptions(options) {
      options.conditions = ['node']
      options.platform = 'node'
    },
  },
])
