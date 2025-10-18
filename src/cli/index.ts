#!/usr/bin/env node

/**
 * Main CLI entry point for Go Corp Workflow
 */

import { Command } from 'commander'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { exitProcess, handleProcessSignals, logger } from '../utils/index.js'
import { loadWorkflowConfig } from '../config/index.js'

const program = new Command()

program
  .name('go-workflow')
  .description('Comprehensive workflow automation for Go Corp projects')
  .version('1.0.0')

// Release command
program
  .command('release')
  .description('Interactive release management')
  .option('-t, --type <type>', 'Release type (patch|minor|major)')
  .option('--no-interactive', 'Run in non-interactive mode')
  .option('--deploy', 'Deploy after release')
  .option('--no-github', 'Skip GitHub release creation')
  .option('--no-npm', 'Skip npm publishing')
  .action(async (options) => {
    try {
      const { runRelease } = await import('./release.js')
      await runRelease(options)
    } catch (error) {
      logger.error(`Release failed: ${error}`)
      exitProcess(1)
    }
  })

// Feature release command
program
  .command('feature')
  .description('Feature branch release workflow')
  .option('-t, --title <title>', 'Feature title')
  .option('-d, --description <description>', 'Feature description')
  .option('--no-interactive', 'Run in non-interactive mode')
  .option('--auto-merge', 'Enable auto-merge for PR')
  .action(async (options) => {
    try {
      const { runFeatureRelease } = await import('./feature.js')
      await runFeatureRelease(options)
    } catch (error) {
      logger.error(`Feature release failed: ${error}`)
      exitProcess(1)
    }
  })

// Deploy command
program
  .command('deploy')
  .description('Deploy to configured targets')
  .option('-t, --target <target>', 'Specific deployment target')
  .option('--all', 'Deploy to all targets')
  .option('--no-confirm', 'Skip confirmation prompts')
  .action(async (options) => {
    try {
      const { runDeploy } = await import('./deploy.js')
      await runDeploy(options)
    } catch (error) {
      logger.error(`Deploy failed: ${error}`)
      exitProcess(1)
    }
  })

// Init command
program
  .command('init')
  .description('Initialize workflow configuration')
  .option('-f, --force', 'Overwrite existing configuration')
  .action(async (options) => {
    try {
      await initWorkflowConfig(options.force)
    } catch (error) {
      logger.error(`Init failed: ${error}`)
      exitProcess(1)
    }
  })

// Config command
program
  .command('config')
  .description('View or edit configuration')
  .option('--show', 'Show current configuration')
  .option('--edit', 'Edit configuration file')
  .action(async (options) => {
    try {
      if (options.show) {
        await showConfig()
      } else if (options.edit) {
        await editConfig()
      } else {
        logger.info('Use --show to view or --edit to modify configuration')
      }
    } catch (error) {
      logger.error(`Config command failed: ${error}`)
      exitProcess(1)
    }
  })

// Status command
program
  .command('status')
  .description('Show project and workflow status')
  .action(async () => {
    try {
      await showStatus()
    } catch (error) {
      logger.error(`Status command failed: ${error}`)
      exitProcess(1)
    }
  })

/**
 * Initialize workflow configuration
 */
async function initWorkflowConfig(force: boolean = false): Promise<void> {
  const configPath = join(process.cwd(), '.go-workflow.config.js')
  
  if (existsSync(configPath) && !force) {
    logger.warning('Configuration file already exists. Use --force to overwrite.')
    return
  }

  const { prompt } = await import('enquirer')
  
  // Gather configuration information
  const answers = await prompt([
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      initial: process.cwd().split('/').pop(),
    },
    {
      type: 'input',
      name: 'repository',
      message: 'Repository URL (optional):',
    },
    {
      type: 'multiselect',
      name: 'deploymentTargets',
      message: 'Select deployment targets:',
      choices: [
        { name: 'cloudflare-workers', message: 'Cloudflare Workers' },
        { name: 'vercel', message: 'Vercel' },
        { name: 'netlify', message: 'Netlify' },
        { name: 'aws', message: 'AWS' },
        { name: 'custom', message: 'Custom' },
      ],
    },
    {
      type: 'confirm',
      name: 'npmPublishing',
      message: 'Enable NPM publishing?',
      initial: false,
    },
    {
      type: 'confirm',
      name: 'githubReleases',
      message: 'Enable GitHub releases?',
      initial: true,
    },
  ]) as any

  // Generate configuration
  const config = {
    name: answers.projectName,
    repository: answers.repository || undefined,
    deployments: answers.deploymentTargets.map((target: string) => ({
      target,
      name: target.charAt(0).toUpperCase() + target.slice(1),
      command: getDefaultDeployCommand(target),
    })),
    npm: answers.npmPublishing ? {
      access: 'public',
      autoPublish: false,
    } : undefined,
    github: answers.githubReleases ? {
      autoRelease: true,
      autoMerge: true,
      labels: ['enhancement'],
    } : undefined,
  }

  // Write configuration file
  const configContent = `/**
 * Go Corp Workflow Configuration
 */

export default ${JSON.stringify(config, null, 2)}
`

  const fs = await import('node:fs/promises')
  await fs.writeFile(configPath, configContent, 'utf-8')

  logger.success(`Configuration created at ${configPath}`)
  logger.info('You can edit this file to customize your workflow settings.')
}

/**
 * Get default deploy command for target
 */
function getDefaultDeployCommand(target: string): string {
  const commands: Record<string, string> = {
    'cloudflare-workers': 'wrangler deploy',
    'vercel': 'vercel --prod',
    'netlify': 'netlify deploy --prod',
    'aws': 'aws deploy',
    'custom': 'npm run deploy',
  }
  
  return commands[target] || 'echo "Configure deploy command"'
}

/**
 * Show current configuration
 */
async function showConfig(): Promise<void> {
  try {
    const config = await loadWorkflowConfig()
    
    logger.section('Current Configuration')
    console.log(JSON.stringify(config, null, 2))
  } catch (error) {
    logger.error('No configuration found. Run "go-workflow init" to create one.')
  }
}

/**
 * Edit configuration file
 */
async function editConfig(): Promise<void> {
  const configPath = join(process.cwd(), '.go-workflow.config.js')
  
  if (!existsSync(configPath)) {
    logger.error('No configuration found. Run "go-workflow init" to create one.')
    return
  }

  const { execa } = await import('execa')
  const editor = process.env.EDITOR || 'nano'
  
  try {
    await execa(editor, [configPath], { stdio: 'inherit' })
    logger.success('Configuration updated')
  } catch (error) {
    logger.error(`Failed to open editor: ${error}`)
  }
}

/**
 * Show project and workflow status
 */
async function showStatus(): Promise<void> {
  const { createGitOperations } = await import('../git/index.js')
  const { createGitHubIntegration } = await import('../github/index.js')
  
  const git = createGitOperations()
  const github = createGitHubIntegration()

  logger.section('Project Status')

  // Git status
  const isGitRepo = await git.isGitRepository()
  if (!isGitRepo) {
    logger.warning('Not a Git repository')
    return
  }

  const currentBranch = await git.getCurrentBranch()
  const hasUncommitted = await git.hasUncommittedChanges()
  const currentVersion = git.getCurrentVersion()

  logger.info(`📂 Branch: ${currentBranch}`)
  logger.info(`🏷️  Version: ${currentVersion}`)
  logger.info(`📝 Uncommitted changes: ${hasUncommitted ? 'Yes' : 'No'}`)

  // GitHub status
  const ghStatus = await github.checkGHCLI()
  logger.info(`🔗 GitHub CLI: ${ghStatus.installed ? 'Installed' : 'Not installed'}`)
  logger.info(`🔐 GitHub Auth: ${ghStatus.authenticated ? 'Authenticated' : 'Not authenticated'}`)

  if (ghStatus.installed && ghStatus.authenticated) {
    const repoInfo = await github.getRepoInfo()
    if (repoInfo) {
      logger.info(`📦 Repository: ${repoInfo.owner}/${repoInfo.repo}`)
    }
  }

  // Configuration status
  try {
    const config = await loadWorkflowConfig()
    logger.info(`⚙️  Configuration: Loaded (${config.deployments?.length || 0} deployments configured)`)
  } catch {
    logger.warning('⚙️  Configuration: Not found (run "go-workflow init")')
  }
}

// Handle process signals
handleProcessSignals()

// Error handling
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`)
  console.error(error)
  exitProcess(1)
})

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`)
  exitProcess(1)
})

// Parse command line arguments
program.parse()

export default program