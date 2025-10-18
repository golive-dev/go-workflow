/**
 * Monorepo Go Workflow Configuration
 * 
 * Configuration for monorepo with multiple packages and deployment targets
 */

export default {
  // Project information
  name: 'my-monorepo',
  repository: 'https://github.com/my-org/my-monorepo',
  defaultBranch: 'main',

  // Multiple deployment targets for different packages
  deployments: [
    {
      target: 'cloudflare-workers',
      name: 'API Service',
      command: 'npm run deploy',
      cwd: './packages/api',
      preCommand: 'npm run build',
      env: {
        CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
      },
    },
    {
      target: 'vercel',
      name: 'Web Application',
      command: 'vercel --prod',
      cwd: './packages/web',
      preCommand: 'npm run build',
      env: {
        VERCEL_TOKEN: process.env.VERCEL_TOKEN,
      },
    },
    {
      target: 'netlify',
      name: 'Documentation Site',
      command: 'netlify deploy --prod --dir=dist',
      cwd: './packages/docs',
      preCommand: 'npm run build',
      env: {
        NETLIFY_AUTH_TOKEN: process.env.NETLIFY_AUTH_TOKEN,
      },
    },
    {
      target: 'custom',
      name: 'Mobile App Build',
      command: 'npm run build:mobile',
      cwd: './packages/mobile',
      preCommand: 'npm run test:mobile',
      confirmRequired: true,
    },
  ],

  // Monorepo-specific changelog configuration
  changelog: {
    path: 'CHANGELOG.md',
    includeTypes: ['feat', 'fix', 'perf', 'refactor'],
    sections: [
      { title: '🚀 Features', types: ['feat'] },
      { title: '🐛 Bug Fixes', types: ['fix'] },
      { title: '⚡ Performance', types: ['perf'] },
      { title: '♻️ Refactoring', types: ['refactor'] },
    ],
  },

  // GitHub integration
  github: {
    autoRelease: true,
    autoMerge: false, // Manual review for monorepo
    labels: ['monorepo', 'enhancement'],
  },

  // NPM publishing for all packages
  npm: {
    access: 'public',
    autoPublish: false, // Manual publishing for monorepo packages
  },

  // Monorepo-specific commands
  commands: {
    preRelease: [
      // Install dependencies for all packages
      'npm ci',
      
      // Build all packages
      'npm run build --workspaces',
      
      // Run tests for all packages
      'npm run test --workspaces',
      
      // Lint all packages
      'npm run lint --workspaces',
      
      // Type check all packages
      'npm run type-check --workspaces',
    ],
    postRelease: [
      // Build documentation
      'npm run docs:build --workspace=packages/docs',
      
      // Update package versions (handled separately for monorepos)
      'npm run version:sync',
    ],
    
    // Individual package commands
    build: 'npm run build --workspaces',
    test: 'npm run test --workspaces',
    lint: 'npm run lint --workspaces',
  },
}