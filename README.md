# @golive_me/go-workflow

Comprehensive workflow automation for Go Corp projects with release management, CI/CD integration, and deployment orchestration.

## ✨ Features

- 🚀 **Automated Release Management** - Semantic versioning, changelog generation, and Git tagging
- 🔄 **GitHub Integration** - PR creation, auto-merge, and GitHub releases
- 📦 **NPM Publishing** - Automated package publishing with registry support
- 🌐 **Multi-Platform Deployment** - Support for Cloudflare Workers, Vercel, Netlify, AWS, and custom targets
- 📝 **Changelog Management** - Conventional commits parsing and automated changelog generation
- 🎯 **Interactive CLI** - User-friendly command-line interface with smart defaults
- ⚙️ **Flexible Configuration** - Project-specific settings with environment overrides
- 🧪 **Built-in Testing** - Integration with testing frameworks and quality gates

## 🚀 Quick Start

### Installation

```bash
npm install -g @golive_me/go-workflow
# or
yarn global add @golive_me/go-workflow
# or
pnpm add -g @golive_me/go-workflow
```

### Initialize Configuration

```bash
cd your-project
go-workflow init
```

This creates a `.go-workflow.config.js` file with your project settings.

### Basic Usage

```bash
# Interactive release
go-workflow release

# Deploy to configured targets
go-workflow deploy

# Check status
go-workflow status

# Feature branch workflow
go-workflow feature
```

## 📋 Commands

### `go-workflow init`

Initialize workflow configuration in your project.

```bash
go-workflow init [options]

Options:
  -f, --force    Overwrite existing configuration
```

### `go-workflow release`

Interactive release management with automated versioning.

```bash
go-workflow release [options]

Options:
  -t, --type <type>        Release type (patch|minor|major)
  --no-interactive         Run in non-interactive mode
  --deploy                 Deploy after release
  --no-github             Skip GitHub release creation
  --no-npm                Skip npm publishing
```

### `go-workflow feature`

Feature branch release workflow with PR automation.

```bash
go-workflow feature [options]

Options:
  -t, --title <title>         Feature title
  -d, --description <desc>    Feature description
  --no-interactive           Run in non-interactive mode
  --auto-merge               Enable auto-merge for PR
```

### `go-workflow deploy`

Deploy to configured deployment targets.

```bash
go-workflow deploy [options]

Options:
  -t, --target <target>    Specific deployment target
  --all                    Deploy to all targets
  --no-confirm            Skip confirmation prompts
```

### `go-workflow status`

Show project and workflow status.

```bash
go-workflow status
```

### `go-workflow config`

View or edit configuration.

```bash
go-workflow config [options]

Options:
  --show    Show current configuration
  --edit    Edit configuration file
```

## ⚙️ Configuration

### Basic Configuration

Create a `.go-workflow.config.js` file in your project root:

```javascript
export default {
  // Project information
  name: 'my-awesome-project',
  repository: 'https://github.com/my-org/my-project',
  defaultBranch: 'main',

  // Deployment targets
  deployments: [
    {
      target: 'cloudflare-workers',
      name: 'Cloudflare Workers',
      command: 'wrangler deploy',
      confirmRequired: false,
    },
    {
      target: 'vercel',
      name: 'Vercel Production',
      command: 'vercel --prod',
      confirmRequired: true,
      env: {
        VERCEL_TOKEN: process.env.VERCEL_TOKEN,
      },
    },
  ],

  // GitHub integration
  github: {
    autoRelease: true,
    autoMerge: true,
    labels: ['enhancement', 'automated'],
  },

  // NPM publishing
  npm: {
    registry: 'https://registry.npmjs.org',
    access: 'public',
    autoPublish: false,
  },

  // Changelog configuration
  changelog: {
    path: 'CHANGELOG.md',
    includeTypes: ['feat', 'fix', 'perf', 'refactor', 'docs'],
    sections: [
      { title: '🚀 Features', types: ['feat'] },
      { title: '🐛 Bug Fixes', types: ['fix'] },
      { title: '⚡ Performance', types: ['perf'] },
    ],
  },

  // Custom commands
  commands: {
    preRelease: ['npm run build', 'npm test'],
    postRelease: ['npm run docs'],
  },
}
```

### Environment Configuration

Override configuration with environment variables:

```bash
# GitHub settings
export GO_WORKFLOW_AUTO_RELEASE=true
export GO_WORKFLOW_AUTO_MERGE=false

# NPM settings
export GO_WORKFLOW_AUTO_PUBLISH=true
export NPM_REGISTRY=https://registry.npmjs.org
```

### Package.json Configuration

Add configuration directly to your `package.json`:

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "go-workflow": {
    "deployments": [
      {
        "target": "cloudflare-workers",
        "command": "wrangler deploy"
      }
    ],
    "github": {
      "autoRelease": true
    }
  }
}
```

## 🔧 Deployment Targets

### Cloudflare Workers

```javascript
{
  target: 'cloudflare-workers',
  name: 'Production Worker',
  command: 'wrangler deploy',
  env: {
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
  },
}
```

### Vercel

```javascript
{
  target: 'vercel',
  name: 'Vercel Production',
  command: 'vercel --prod',
  preCommand: 'npm run build',
  env: {
    VERCEL_TOKEN: process.env.VERCEL_TOKEN,
  },
}
```

### Netlify

```javascript
{
  target: 'netlify',
  name: 'Netlify Production',
  command: 'netlify deploy --prod',
  preCommand: 'npm run build',
  env: {
    NETLIFY_AUTH_TOKEN: process.env.NETLIFY_AUTH_TOKEN,
  },
}
```

### AWS

```javascript
{
  target: 'aws',
  name: 'AWS Production',
  command: 'aws s3 sync dist/ s3://my-bucket --delete',
  preCommand: 'npm run build',
  postCommand: 'aws cloudfront create-invalidation --distribution-id E123456789 --paths "/*"',
}
```

### Custom Deployment

```javascript
{
  target: 'custom',
  name: 'Custom Deployment',
  command: 'docker build -t my-app . && docker push my-registry/my-app',
  confirmRequired: true,
}
```

## 📝 Changelog Management

The workflow automatically generates changelogs from conventional commits:

### Supported Commit Types

- `feat`: New features
- `fix`: Bug fixes
- `perf`: Performance improvements
- `refactor`: Code refactoring
- `docs`: Documentation changes
- `style`: Code style changes
- `test`: Test changes
- `build`: Build system changes
- `ci`: CI configuration changes
- `chore`: Maintenance tasks

### Breaking Changes

Mark breaking changes with `!` or `BREAKING CHANGE:`:

```bash
git commit -m "feat!: remove deprecated API"
# or
git commit -m "feat: new API

BREAKING CHANGE: The old API has been removed. Use newAPI() instead."
```

## 🔄 GitHub Integration

### Prerequisites

1. Install [GitHub CLI](https://cli.github.com/)
2. Authenticate: `gh auth login`
3. Configure repository access

## Core Features

- **Automatic PR Creation**: Creates PRs for feature branches
- **Auto-merge**: Enables auto-merge with squash strategy
- **Release Creation**: Generates GitHub releases with detailed notes
- **Workflow Integration**: Waits for CI checks before merging

### Example Workflow

```bash
# Create feature branch
git checkout -b feature/new-api

# Make changes and commit
git add .
git commit -m "feat: add new API endpoint"

# Push and create PR
git push -u origin feature/new-api
go-workflow feature --auto-merge
```

## 📦 NPM Publishing

### Prerequisites

1. NPM account with publishing permissions
2. Authentication: `npm login`
3. Package configured for publishing

### Publishing Workflow

```bash
# Automatic publishing during release
go-workflow release --deploy

# Manual publishing
npm run build
npm publish
```

### Publishing to Private Registry

```javascript
// .go-workflow.config.js
export default {
  npm: {
    registry: 'https://npm.your-company.com',
    access: 'private',
    tag: 'latest',
  },
}
```

## 🧪 Programmatic Usage

Use the workflow API in your own scripts:

```javascript
import { createWorkflow, quickRelease } from '@golive_me/go-workflow'

// Create workflow instance
const workflow = await createWorkflow()

// Execute release
const result = await workflow.executeRelease('minor', {
  deploy: true,
  createGitHubRelease: true,
})

console.log(`Released version ${result.version.to}`)

// Quick release
await quickRelease('patch')
```

### Advanced Usage

```javascript
import {
  createGitOperations,
  createChangelogManager,
  createGitHubIntegration,
  createNpmPublisher,
} from '@golive_me/go-workflow'

// Individual components
const git = createGitOperations()
const changelog = createChangelogManager()
const github = createGitHubIntegration()
const npm = createNpmPublisher()

// Custom workflow
const currentVersion = git.getCurrentVersion()
const commits = await git.getCommitsSince()
const entry = changelog.generateEntry('1.2.0', commits)

await github.createRelease({
  title: 'v1.2.0',
  body: 'Release notes...',
  tag: 'v1.2.0',
  prerelease: false,
})
```

## 🔍 Examples

### Basic Project Setup

```bash
# Initialize new project
mkdir my-project && cd my-project
npm init -y
git init

# Install workflow
npm install --save-dev @golive_me/go-workflow

# Initialize configuration
npx go-workflow init

# Make first release
git add .
git commit -m "feat: initial release"
npx go-workflow release
```

### Monorepo Setup

```javascript
// .go-workflow.config.js
export default {
  deployments: [
    {
      target: 'cloudflare-workers',
      name: 'API Worker',
      command: 'npm run deploy:api',
      cwd: './packages/api',
    },
    {
      target: 'vercel',
      name: 'Frontend App',
      command: 'vercel --prod',
      cwd: './packages/frontend',
    },
  ],
  commands: {
    preRelease: [
      'npm run build --workspaces',
      'npm run test --workspaces',
    ],
  },
}
```

### CI/CD Integration

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '18'

      - run: npm ci
      - run: npx go-workflow release --no-interactive
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## 🛠️ Development

### Building from Source

```bash
git clone https://github.com/go-corp/workflow.git
cd workflow
npm install
npm run build
```

### Running Tests

```bash
npm test
npm run test:watch
npm run test:coverage
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Support

- 📖 [Documentation](https://github.com/go-corp/workflow/docs)
- 🐛 [Issue Tracker](https://github.com/go-corp/workflow/issues)
- 💬 [Discussions](https://github.com/go-corp/workflow/discussions)

---

**Made with ❤️ by the Go Corp team**