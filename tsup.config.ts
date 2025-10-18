import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/cli/index.ts',
    'src/cli/release.ts',
    'src/cli/feature.ts',
    'src/cli/deploy.ts',
    'src/git/index.ts',
    'src/changelog/index.ts',
    'src/github/index.ts',
    'src/npm/index.ts',
    'src/deploy/index.ts',
    'src/config/index.ts',
    'src/utils/index.ts',
  ],
  format: ['esm'],
  target: 'node18',
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  external: [
    'node:fs',
    'node:path',
    'node:process',
    'node:child_process',
    'node:readline',
    'node:util',
    'node:os',
    'node:crypto',
  ],
  banner: {
    js: '#!/usr/bin/env node',
  },
  esbuildOptions(options) {
    options.conditions = ['node']
  },
})