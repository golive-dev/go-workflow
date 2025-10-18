/**
 * Configuration management for Go Corp Workflow
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { WorkflowConfig } from '../types.js'
import { logger, safeJsonParse } from '../utils/index.js'

/**
 * Default workflow configuration
 */
export const DEFAULT_CONFIG: WorkflowConfig = {
  name: 'my-project',
  defaultBranch: 'main',
  deployments: [],
  changelog: {
    path: 'CHANGELOG.md',
    includeTypes: ['feat', 'fix', 'perf', 'refactor', 'docs', 'style', 'test', 'build', 'ci', 'chore'],
    excludeTypes: [],
    sections: [
      { title: 'Features', types: ['feat'] },
      { title: 'Bug Fixes', types: ['fix'] },
      { title: 'Performance Improvements', types: ['perf'] },
      { title: 'Refactoring', types: ['refactor'] },
      { title: 'Documentation', types: ['docs'] },
      { title: 'Styles', types: ['style'] },
      { title: 'Tests', types: ['test'] },
      { title: 'Build System', types: ['build'] },
      { title: 'Continuous Integration', types: ['ci'] },
      { title: 'Chores', types: ['chore'] },
    ],
  },
  github: {
    autoRelease: true,
    autoMerge: false,
    labels: ['enhancement'],
  },
  npm: {
    access: 'public',
    autoPublish: false,
  },
  git: {
    tagPrefix: 'v',
    pushTags: true,
    remote: 'origin',
  },
  commands: {
    build: 'npm run build',
    test: 'npm test',
    lint: 'npm run lint',
  },
}

/**
 * Configuration file names to search for
 */
const CONFIG_FILES = [
  '.go-workflow.config.js',
  '.go-workflow.config.mjs',
  '.go-workflow.config.ts',
  'go-workflow.config.js',
  'go-workflow.config.mjs',
  'go-workflow.config.ts',
  '.go-workflowrc.js',
  '.go-workflowrc.mjs',
  '.go-workflowrc.json',
]

/**
 * Load workflow configuration from various sources
 */
export async function loadWorkflowConfig(cwd: string = process.cwd()): Promise<WorkflowConfig> {
  // Try to load from configuration files
  const config = await loadConfigFromFiles(cwd)
  
  // Merge with package.json config if it exists
  const packageConfig = loadConfigFromPackageJson(cwd)
  
  // Merge with environment variables
  const envConfig = loadConfigFromEnv()
  
  // Merge all configurations with defaults
  return mergeConfigs(DEFAULT_CONFIG, packageConfig, config, envConfig)
}

/**
 * Load configuration from config files
 */
async function loadConfigFromFiles(cwd: string): Promise<Partial<WorkflowConfig>> {
  for (const configFile of CONFIG_FILES) {
    const configPath = join(cwd, configFile)
    
    if (!existsSync(configPath)) {
      continue
    }

    try {
      if (configFile.endsWith('.json')) {
        // JSON configuration
        const fs = await import('node:fs/promises')
        const content = await fs.readFile(configPath, 'utf-8')
        return safeJsonParse<Partial<WorkflowConfig>>(content, {})
      } else {
        // JavaScript/TypeScript configuration
        const configUrl = pathToFileURL(configPath).href
        const module = await import(configUrl)
        const config = module.default || module
        
        if (typeof config === 'function') {
          return await config()
        }
        
        return config
      }
    } catch (error) {
      logger.warning(`Failed to load config from ${configFile}: ${error}`)
      continue
    }
  }
  
  return {}
}

/**
 * Load configuration from package.json
 */
function loadConfigFromPackageJson(cwd: string): Partial<WorkflowConfig> {
  const packagePath = join(cwd, 'package.json')
  
  if (!existsSync(packagePath)) {
    return {}
  }

  try {
    const fs = require('node:fs')
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))
    
    const config: Partial<WorkflowConfig> = {}
    
    // Extract relevant information
    if (packageJson.name) {
      config.name = packageJson.name
    }
    
    if (packageJson.repository) {
      if (typeof packageJson.repository === 'string') {
        config.repository = packageJson.repository
      } else if (packageJson.repository.url) {
        config.repository = packageJson.repository.url
      }
    }
    
    // Check for workflow config in package.json
    if (packageJson['go-workflow']) {
      return mergeConfigs(config, packageJson['go-workflow'])
    }
    
    return config
  } catch {
    return {}
  }
}

/**
 * Load configuration from environment variables
 */
function loadConfigFromEnv(): Partial<WorkflowConfig> {
  const config: Partial<WorkflowConfig> = {}
  
  // GitHub configuration
  if (process.env.GITHUB_TOKEN) {
    config.github = {
      ...config.github,
      autoRelease: process.env.GO_WORKFLOW_AUTO_RELEASE === 'true',
      autoMerge: process.env.GO_WORKFLOW_AUTO_MERGE === 'true',
    }
  }
  
  // NPM configuration
  if (process.env.NPM_TOKEN) {
    const npmConfig = {
      ...config.npm,
      autoPublish: process.env.GO_WORKFLOW_AUTO_PUBLISH === 'true',
    }
    
    if (process.env.NPM_REGISTRY) {
      npmConfig.registry = process.env.NPM_REGISTRY
    }
    
    config.npm = npmConfig
  }
  
  return config
}

/**
 * Merge multiple configuration objects
 */
function mergeConfigs(...configs: Array<Partial<WorkflowConfig> | undefined>): WorkflowConfig {
  const result: WorkflowConfig = { ...DEFAULT_CONFIG }
  
  for (const config of configs) {
    if (!config) continue
    
    // Simple merge for top-level properties
    Object.assign(result, config)
    
    // Deep merge for nested objects
    if (config.changelog) {
      result.changelog = { ...result.changelog, ...config.changelog }
    }
    
    if (config.github) {
      result.github = { ...result.github, ...config.github }
    }
    
    if (config.npm) {
      result.npm = { ...result.npm, ...config.npm }
    }
    
    if (config.git) {
      result.git = { ...result.git, ...config.git }
    }
    
    if (config.commands) {
      result.commands = { ...result.commands, ...config.commands }
    }
    
    // Merge arrays
    if (config.deployments) {
      result.deployments = [...(result.deployments || []), ...config.deployments]
    }
  }
  
  return result
}

/**
 * Validate configuration
 */
export function validateConfig(config: WorkflowConfig): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  // Validate project name
  if (!config.name || typeof config.name !== 'string') {
    errors.push('Project name is required and must be a string')
  }
  
  // Validate deployments
  if (config.deployments) {
    for (const [index, deployment] of config.deployments.entries()) {
      if (!deployment.target) {
        errors.push(`Deployment ${index}: target is required`)
      }
      
      if (!deployment.command) {
        errors.push(`Deployment ${index}: command is required`)
      }
    }
  }
  
  // Validate changelog config
  if (config.changelog) {
    if (config.changelog.sections) {
      for (const [index, section] of config.changelog.sections.entries()) {
        if (!section.title) {
          errors.push(`Changelog section ${index}: title is required`)
        }
        
        if (!Array.isArray(section.types) || section.types.length === 0) {
          errors.push(`Changelog section ${index}: types must be a non-empty array`)
        }
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Create a sample configuration file
 */
export function createSampleConfig(): string {
  return `/**
 * Go Corp Workflow Configuration
 * 
 * This file configures the workflow automation for your project.
 * You can customize deployment targets, GitHub settings, NPM publishing, and more.
 */

export default {
  // Project information
  name: '${DEFAULT_CONFIG.name}',
  repository: 'https://github.com/your-org/your-repo',
  defaultBranch: '${DEFAULT_CONFIG.defaultBranch}',

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
      name: 'Vercel',
      command: 'vercel --prod',
      confirmRequired: true,
    },
  ],

  // Changelog configuration
  changelog: {
    path: 'CHANGELOG.md',
    includeTypes: ['feat', 'fix', 'perf', 'refactor', 'docs'],
    excludeTypes: ['chore', 'test'],
    sections: [
      { title: '🚀 Features', types: ['feat'] },
      { title: '🐛 Bug Fixes', types: ['fix'] },
      { title: '⚡ Performance', types: ['perf'] },
      { title: '♻️ Refactoring', types: ['refactor'] },
      { title: '📝 Documentation', types: ['docs'] },
    ],
  },

  // GitHub integration
  github: {
    autoRelease: true,
    autoMerge: true,
    labels: ['enhancement', 'automated'],
    releaseTemplate: 'Release v{{version}}',
    prTemplate: 'feat: {{title}}',
  },

  // NPM publishing
  npm: {
    registry: 'https://registry.npmjs.org',
    access: 'public',
    tag: 'latest',
    autoPublish: false,
  },

  // Git configuration
  git: {
    commitTemplate: '{{type}}: {{message}}',
    tagPrefix: 'v',
    pushTags: true,
    remote: 'origin',
  },

  // Custom commands
  commands: {
    preRelease: ['npm run build', 'npm test'],
    postRelease: ['npm run docs'],
    build: 'npm run build',
    test: 'npm test',
    lint: 'npm run lint',
  },
}
`
}

/**
 * Get configuration for a specific environment
 */
export function getEnvConfig(env: 'development' | 'staging' | 'production'): Partial<WorkflowConfig> {
  const configs = {
    development: {
      github: {
        autoRelease: false,
        autoMerge: false,
      },
      npm: {
        autoPublish: false,
      },
    },
    staging: {
      github: {
        autoRelease: true,
        autoMerge: false,
      },
      npm: {
        autoPublish: false,
        tag: 'beta',
      },
    },
    production: {
      github: {
        autoRelease: true,
        autoMerge: true,
      },
      npm: {
        autoPublish: true,
        tag: 'latest',
      },
    },
  }
  
  return configs[env] || {}
}

/**
 * Apply environment-specific overrides
 */
export async function loadConfigWithEnv(
  env: 'development' | 'staging' | 'production' = 'development',
  cwd?: string,
): Promise<WorkflowConfig> {
  const baseConfig = await loadWorkflowConfig(cwd)
  const envConfig = getEnvConfig(env)
  
  return mergeConfigs(baseConfig, envConfig)
}