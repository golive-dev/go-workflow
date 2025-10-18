/**
 * Advanced Go Workflow Configuration
 * 
 * Multi-platform deployment with comprehensive settings
 */

export default {
  // Project information
  name: 'enterprise-app',
  repository: 'https://github.com/enterprise/enterprise-app',
  defaultBranch: 'main',

  // Multiple deployment targets with environments
  deployments: [
    {
      target: 'cloudflare-workers',
      name: 'API Production',
      command: 'wrangler deploy --env production',
      preCommand: 'npm run build:api',
      env: {
        CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
        NODE_ENV: 'production',
      },
      confirmRequired: false,
    },
    {
      target: 'vercel',
      name: 'Frontend Production',
      command: 'vercel --prod',
      preCommand: 'npm run build:frontend',
      cwd: './packages/frontend',
      env: {
        VERCEL_TOKEN: process.env.VERCEL_TOKEN,
      },
      confirmRequired: true,
    },
    {
      target: 'aws',
      name: 'S3 + CloudFront',
      command: 'aws s3 sync dist/ s3://my-bucket --delete',
      preCommand: 'npm run build:static',
      postCommand: 'aws cloudfront create-invalidation --distribution-id E123456789 --paths "/*"',
      env: {
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        AWS_DEFAULT_REGION: 'us-east-1',
      },
      confirmRequired: true,
    },
    {
      target: 'custom',
      name: 'Docker Registry',
      command: 'docker buildx build --platform linux/amd64,linux/arm64 -t my-registry/app:latest --push .',
      preCommand: 'npm run test:integration',
      confirmRequired: true,
    },
  ],

  // Comprehensive changelog configuration
  changelog: {
    path: 'CHANGELOG.md',
    includeTypes: ['feat', 'fix', 'perf', 'refactor', 'docs', 'style', 'test', 'build', 'ci'],
    excludeTypes: ['chore'],
    sections: [
      { title: '🚀 New Features', types: ['feat'] },
      { title: '🐛 Bug Fixes', types: ['fix'] },
      { title: '⚡ Performance Improvements', types: ['perf'] },
      { title: '♻️ Code Refactoring', types: ['refactor'] },
      { title: '📝 Documentation', types: ['docs'] },
      { title: '💄 Styling', types: ['style'] },
      { title: '🧪 Tests', types: ['test'] },
      { title: '📦 Build System', types: ['build'] },
      { title: '👷 CI/CD', types: ['ci'] },
    ],
  },

  // GitHub integration with advanced settings
  github: {
    autoRelease: true,
    autoMerge: true,
    labels: ['enhancement', 'automated', 'production'],
    releaseTemplate: 'Release v{{version}} - {{title}}',
    prTemplate: '{{type}}: {{title}}',
  },

  // NPM publishing with registry
  npm: {
    registry: 'https://registry.npmjs.org',
    access: 'public',
    tag: 'latest',
    autoPublish: true,
  },

  // Git configuration
  git: {
    commitTemplate: '{{type}}{{scope}}: {{message}}',
    tagPrefix: 'v',
    pushTags: true,
    remote: 'origin',
  },

  // Comprehensive command configuration
  commands: {
    preRelease: [
      'npm run lint',
      'npm run type-check',
      'npm run test',
      'npm run test:integration',
      'npm run build',
    ],
    postRelease: [
      'npm run docs:build',
      'npm run notify:team',
    ],
    build: 'npm run build:all',
    test: 'npm run test:ci',
    lint: 'npm run lint:all',
  },
}