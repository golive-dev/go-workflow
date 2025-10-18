/**
 * Basic Go Workflow Configuration
 * 
 * Simple setup for a typical project with Cloudflare Workers deployment
 */

export default {
  // Project information
  name: 'my-awesome-app',
  repository: 'https://github.com/my-org/my-awesome-app',
  defaultBranch: 'main',

  // Single deployment target
  deployments: [
    {
      target: 'cloudflare-workers',
      name: 'Production',
      command: 'wrangler deploy',
      confirmRequired: false,
    },
  ],

  // Simple changelog configuration  
  changelog: {
    path: 'CHANGELOG.md',
    includeTypes: ['feat', 'fix', 'perf'],
    sections: [
      { title: '🚀 Features', types: ['feat'] },
      { title: '🐛 Bug Fixes', types: ['fix'] },
      { title: '⚡ Performance', types: ['perf'] },
    ],
  },

  // GitHub integration
  github: {
    autoRelease: true,
    autoMerge: false,
    labels: ['enhancement'],
  },

  // NPM publishing (disabled for private projects)
  npm: {
    access: 'public',
    autoPublish: false,
  },

  // Basic commands
  commands: {
    preRelease: ['npm test'],
    build: 'npm run build',
    test: 'npm test',
    lint: 'npm run lint',
  },
}