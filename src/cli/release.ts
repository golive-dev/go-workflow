/**
 * Release command implementation
 */

import { prompt } from 'enquirer'
import semver from 'semver'
import { createWorkflow } from '../index.js'
import { loadWorkflowConfig } from '../config/index.js'
import { createGitOperations } from '../git/index.js'
import { createNpmPublisher } from '../npm/index.js'
import { createDeploymentManager } from '../deploy/index.js'
import { createConfirmPrompt, createTimer, exitProcess, isCI, logger, ui } from '../utils/index.js'
import { execa } from 'execa'
import { existsSync } from 'node:fs'
import type { VersionBumpType } from '../types.js'

export interface ReleaseOptions {
  type?: VersionBumpType
  interactive?: boolean
  deploy?: boolean
  github?: boolean
  npm?: boolean
}

export async function runRelease(options: ReleaseOptions): Promise<void> {
  const timer = createTimer()
  
  try {
    logger.section('🚀 Go Corp Release Workflow')
    
    // Run tests FIRST - before any prompts or interaction
    await runTests()
    
    // Load configuration
    const config = await loadWorkflowConfig()
    const git = createGitOperations()
    const workflow = await createWorkflow()
    
    // Validate prerequisites
    const isGitRepo = await git.isGitRepository()
    if (!isGitRepo) {
      logger.error('Not a Git repository')
      exitProcess(1)
    }
    
    // Check for uncommitted changes
    const hasUncommitted = await git.hasUncommittedChanges()
    if (hasUncommitted) {
      const changedFiles = await git.getChangedFiles()
      
      if (options.interactive !== false && !isCI()) {
        // Show the uncommitted changes
        logger.warning('⚠️  Uncommitted changes detected:')
        const fileStats = await git.getChangedFiles()
        fileStats.slice(0, 10).forEach(file => {
          logger.info(`   • ${file}`)
        })
        if (fileStats.length > 10) {
          logger.info(`   ... and ${fileStats.length - 10} more files`)
        }
        
        const shouldCommit = await prompt<{ commit: boolean }>(
          createConfirmPrompt({
            name: 'commit',
            message: '💾 Would you like to commit these changes now?',
            initial: true,
          }),
        )
        
        if (shouldCommit.commit) {
          // Generate a suggested commit message based on the changes
          let suggestedMessage = 'chore: prepare for release'
          
          // Try to be smarter about the commit message
          const hasTypeScript = changedFiles.some(f => f.endsWith('.ts'))
          const hasTests = changedFiles.some(f => f.includes('test') || f.includes('spec'))
          const hasConfig = changedFiles.some(f => f.includes('config') || f.endsWith('.json') || f.endsWith('.yml'))
          const hasDocs = changedFiles.some(f => f.endsWith('.md'))
          
          if (hasTests) {
            suggestedMessage = 'test: update tests and fix issues'
          } else if (hasTypeScript && hasConfig) {
            suggestedMessage = 'fix: resolve TypeScript errors and update config'
          } else if (hasTypeScript) {
            suggestedMessage = 'fix: resolve TypeScript compilation issues'
          } else if (hasDocs) {
            suggestedMessage = 'docs: update documentation'
          } else if (hasConfig) {
            suggestedMessage = 'chore: update configuration'
          }
          
          const commitMessage = await prompt<{ message: string }>({
            type: 'input',
            name: 'message',
            message: 'Commit message:',
            initial: suggestedMessage,
            validate: value => value.length > 0 || 'Commit message is required',
          })
          
          await git.stageFiles()
          const commitHash = await git.commit(commitMessage.message)
          logger.success(`✅ Changes committed: ${commitHash} ${commitMessage.message}`)
        } else {
          const shouldContinue = await prompt<{ continue: boolean }>(
            createConfirmPrompt({
              name: 'continue',
              message: '⚠️  Continue release with uncommitted changes?',
              initial: false,
            }),
          )
          
          if (!shouldContinue.continue) {
            logger.warning('Please commit or stash your changes before releasing')
            exitProcess(1)
          }
        }
      } else {
        logger.error('Uncommitted changes detected. Please commit or stash them first.')
        exitProcess(1)
      }
    }
    
    // Get current state
    const currentVersion = git.getCurrentVersion()
    const currentBranch = await git.getCurrentBranch()
    
    logger.info(`📂 Branch: ${currentBranch}`)
    logger.info(`🏷️  Current version: ${currentVersion}`)
    
    // Analyze changes if interactive
    let versionType = options.type
    let changeAnalysis
    
    if (!versionType && options.interactive !== false) {
      changeAnalysis = await git.analyzeChangesForVersionBump()
      
      logger.info('\n📊 Change Analysis:')
      logger.info(`   • ${changeAnalysis.commits.length} commits since last release`)
      logger.info(`   • ${changeAnalysis.changedFiles.length} files changed`)
      logger.info(`   • Recommended: ${changeAnalysis.versionBump} release`)
      
      if (changeAnalysis.changesList.length > 0) {
        logger.info('\n📝 Changes detected:')
        changeAnalysis.changesList.slice(0, 5).forEach(change => {
          logger.info(`   • ${change}`)
        })
        if (changeAnalysis.changesList.length > 5) {
          logger.info(`   ... and ${changeAnalysis.changesList.length - 5} more changes`)
        }
      }
      
      // Interactive version selection
      const versionOptions = [
        { 
          name: 'patch', 
          message: `🔧 Patch (${semver.inc(currentVersion, 'patch')})${changeAnalysis.versionBump === 'patch' ? ' - recommended' : ''}`,
          value: 'patch' as VersionBumpType,
        },
        { 
          name: 'minor', 
          message: `✨ Minor (${semver.inc(currentVersion, 'minor')})${changeAnalysis.versionBump === 'minor' ? ' - recommended' : ''}`,
          value: 'minor' as VersionBumpType,
        },
        { 
          name: 'major', 
          message: `💥 Major (${semver.inc(currentVersion, 'major')})${changeAnalysis.versionBump === 'major' ? ' - recommended' : ''}`,
          value: 'major' as VersionBumpType,
        },
      ]
      
      const versionChoice = await prompt<{ version: VersionBumpType }>({
        type: 'select',
        name: 'version',
        message: '📈 Select version bump type:',
        choices: versionOptions,
        initial: changeAnalysis.versionBump === 'patch' ? 0 : changeAnalysis.versionBump === 'minor' ? 1 : 2,
      })
      
      versionType = versionChoice.version
    } else if (!versionType) {
      // Non-interactive mode - analyze changes
      changeAnalysis = await git.analyzeChangesForVersionBump()
      versionType = changeAnalysis.versionBump
      logger.info(`🔍 Auto-detected ${versionType} release`)
    }
    
    if (!versionType) {
      throw new Error('Version type not determined')
    }
    
    const newVersion = semver.inc(currentVersion, versionType)
    if (!newVersion) {
      logger.error(`Invalid version calculation from ${currentVersion}`)
      exitProcess(1)
    }
    
    logger.info(`\n📈 Version: ${currentVersion} → ${newVersion}`)
    
    // Interactive deployment options
    let shouldDeploy = options.deploy
    let shouldPublishNpm: boolean | undefined
    
    // Handle npm publishing logic:
    // - If --no-npm was explicitly passed (options.npm === false), don't publish
    // - If config.npm exists and autoPublish is true, auto-publish (unless --no-npm)
    // - Otherwise, prompt the user if in interactive mode
    if (options.npm === false) {
      // Explicitly disabled via --no-npm
      shouldPublishNpm = false
    } else if (config.npm?.autoPublish) {
      // Config says to auto-publish
      shouldPublishNpm = true
    } else {
      // Need to ask user (will be handled in interactive section)
      shouldPublishNpm = undefined
    }
    
    
    if (options.interactive !== false && !isCI()) {
      // Ask about GitHub release
      if (options.github !== false && config.github?.autoRelease) {
        const githubChoice = await prompt<{ github: boolean }>(
          createConfirmPrompt({
            name: 'github',
            message: '🚀 Create GitHub release?',
            initial: config.github?.autoRelease || false,
          }),
        )
        options.github = githubChoice.github
      }
      
      // Ask about deployment
      if (shouldDeploy === undefined && config.deployments && config.deployments.length > 0) {
        // Show specific deployment targets
        const deploymentTargets = config.deployments
          .map(d => {
            if (d.target === 'cloudflare-workers') return '☁️  Cloudflare Workers'
            if (d.target === 'vercel') return '▲ Vercel'
            if (d.target === 'netlify') return '🔷 Netlify'
            if (d.target === 'aws') return '☁️  AWS'
            return `🚀 ${d.name || d.target}`
          })
          .join(', ')
        
        const deployChoice = await prompt<{ deploy: boolean }>(
          createConfirmPrompt({
            name: 'deploy',
            message: `🚀 Deploy to ${deploymentTargets} after release?`,
            initial: false,
          }),
        )
        shouldDeploy = deployChoice.deploy
      }
      
      // Ask about npm publishing - always ask unless explicitly set
      if (shouldPublishNpm === undefined) {
        const npm = createNpmPublisher(config.npm)
        const packageInfo = npm.getPackageInfo()
        
        if (packageInfo) {
          if (!npm.isPrivatePackage()) {
            // More descriptive npm prompt for public packages
            const access = config.npm?.access || 'public'
            const packageName = packageInfo.name
            
            const npmChoice = await prompt<{ npm: boolean }>(
              createConfirmPrompt({
                name: 'npm',
                message: `📦 Publish ${packageName}@${newVersion} to npm (${access} package)?`,
                initial: config.npm?.autoPublish || false,
              }),
            )
            shouldPublishNpm = npmChoice.npm
          } else {
            // Ask for private packages too
            const npmChoice = await prompt<{ npm: boolean }>(
              createConfirmPrompt({
                name: 'npm', 
                message: `📦 Publish ${packageInfo.name}@${newVersion} to npm? (currently marked private)`,
                initial: false,
              }),
            )
            shouldPublishNpm = npmChoice.npm
          }
        } else {
          // No package.json found, still ask in case user wants to publish
          const npmChoice = await prompt<{ npm: boolean }>(
            createConfirmPrompt({
              name: 'npm',
              message: '📦 Publish to npm?',
              initial: false,
            }),
          )
          shouldPublishNpm = npmChoice.npm
        }
      }
      
      // Final confirmation
      let deploymentSummary = '🚀 Deploy: No'
      if (shouldDeploy && config.deployments && config.deployments.length > 0) {
        const targets = config.deployments
          .map(d => {
            if (d.target === 'cloudflare-workers') return 'Cloudflare Workers'
            if (d.target === 'vercel') return 'Vercel'
            if (d.target === 'netlify') return 'Netlify'
            if (d.target === 'aws') return 'AWS'
            return d.name || d.target
          })
          .join(', ')
        deploymentSummary = `🚀 Deploy: Yes → ${targets}`
      }
      
      let npmSummary = '📦 NPM publish: No'
      if (shouldPublishNpm) {
        const npm = createNpmPublisher(config.npm)
        const packageInfo = npm.getPackageInfo()
        const packageName = packageInfo?.name || 'package'
        const access = config.npm?.access || 'public'
        npmSummary = `📦 NPM publish: Yes → ${packageName}@${newVersion} (${access})`
      }
      
      const summary = [
        `🏷️  Version: ${currentVersion} → ${newVersion}`,
        `📦 GitHub release: ${options.github !== false ? 'Yes' : 'No'}`,
        deploymentSummary,
        npmSummary,
      ]
      
      console.log()
      ui.box(summary.join('\n'), '📋 Release Summary')
      console.log()
      
      const finalConfirm = await prompt<{ proceed: boolean }>(
        createConfirmPrompt({
          name: 'proceed',
          message: `✨ Proceed with ${versionType} release?`,
          initial: true,
        }),
      )
      
      if (!finalConfirm.proceed) {
        logger.warning('Release cancelled')
        exitProcess(0)
      }
    }
    
    // Execute release
    logger.step('\n🚀 Executing release...')
    
    const releaseOptions: Parameters<typeof workflow.executeRelease>[1] = {}
    if (shouldDeploy !== undefined) releaseOptions.deploy = shouldDeploy
    if (options.github !== undefined) releaseOptions.createGitHubRelease = options.github
    if (shouldPublishNpm !== undefined) releaseOptions.publishNpm = shouldPublishNpm
    if (options.interactive !== undefined) releaseOptions.interactive = options.interactive
    
    const result = await workflow.executeRelease(versionType, releaseOptions)
    
    if (!result.success) {
      logger.error('❌ Release failed:')
      result.errors.forEach(error => logger.error(`   • ${error}`))
      exitProcess(1)
    }
    
    // Handle deployment
    if (shouldDeploy && config.deployments && config.deployments.length > 0) {
      logger.step('\n🚀 Starting deployment...')
      
      const deploymentManager = createDeploymentManager()
      const deploymentResults = await deploymentManager.deployToTargets(config.deployments)
      
      const successful = deploymentResults.filter(r => r.success)
      const failed = deploymentResults.filter(r => !r.success)
      
      if (successful.length > 0) {
        logger.success(`✅ Successfully deployed to ${successful.length} target(s):`)
        successful.forEach(result => {
          logger.success(`   • ${result.target}${result.url ? ` → ${result.url}` : ''}`)
        })
      }
      
      if (failed.length > 0) {
        logger.error(`❌ Failed to deploy to ${failed.length} target(s):`)
        failed.forEach(result => {
          logger.error(`   • ${result.target}: ${result.error}`)
        })
      }
    }
    
    // Handle npm publishing
    if (shouldPublishNpm) {
      logger.step('\n📦 Publishing to npm...')
      
      const npm = createNpmPublisher(config.npm)
      const publishResult = await npm.publishPackage({
        skipTests: true, // Tests already ran at the beginning of release process
      })
      
      if (publishResult.success) {
        logger.success(`✅ Published ${publishResult.version} to ${publishResult.registry}`)
      } else {
        logger.error(`❌ Failed to publish: ${publishResult.error}`)
      }
    }
    
    // Show final summary
    console.log()
    logger.section('🎉 Release Complete!')
    logger.success(`✅ Released version ${result.version.to} in ${timer.elapsedFormatted()}`)
    
    if (result.actions.length > 0) {
      console.log()
      logger.section('📋 Actions completed')
      ui.table(
        result.actions.map(action => ({
          label: action.name,
          value: action.duration ? `${Math.round(action.duration)}ms` : '',
          status: action.success ? 'success' : 'error',
        })),
      )
      logger.sectionEnd()
    }
    
    // Show next steps
    logger.info('\n📋 Next steps:')
    if (!shouldDeploy && config.deployments && config.deployments.length > 0) {
      logger.info('   • Run "go-workflow deploy" to deploy your changes')
    }
    if (!shouldPublishNpm && config.npm && !createNpmPublisher(config.npm).isPrivatePackage()) {
      logger.info('   • Run "npm publish" to publish to npm')
    }
    logger.info('   • Share the release with your team')
    logger.info('   • Monitor for any issues')
    
  } catch (error) {
    logger.error(`❌ Release failed: ${error}`)
    exitProcess(1)
  }
}

/**
 * Run tests before proceeding with release
 */
async function runTests(): Promise<void> {
  logger.step('🧪 Running tests...')
  
  // Check if package.json exists
  if (!existsSync('package.json')) {
    logger.warning('No package.json found, skipping tests')
    return
  }
  
  try {
    // Read package.json to check for test scripts
    const { readFile } = await import('node:fs/promises')
    const packageJsonContent = await readFile('package.json', 'utf-8')
    const packageJson = JSON.parse(packageJsonContent)
    
    // Check if test script exists
    if (!packageJson.scripts?.test) {
      logger.warning('No test script found in package.json, skipping tests')
      return
    }
    
    // Run tests in CI mode to prevent hanging
    logger.info('   Running: npm test')
    const testResult = await execa('npm', ['test'], {
      stdio: 'pipe',
      reject: false,
      env: {
        ...process.env,
        CI: 'true', // Force CI mode to prevent interactive/watch mode
      },
    })
    
    if (testResult.exitCode === 0) {
      logger.success('✅ All tests passed')
    } else {
      logger.error('❌ Tests failed:')
      if (testResult.stdout) {
        logger.error(testResult.stdout)
      }
      if (testResult.stderr) {
        logger.error(testResult.stderr)
      }
      exitProcess(1)
    }
    
  } catch (error) {
    logger.error(`❌ Failed to run tests: ${error}`)
    exitProcess(1)
  }
}
