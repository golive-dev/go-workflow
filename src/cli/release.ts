#!/usr/bin/env node

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
import { createTimer, exitProcess, isCI, logger } from '../utils/index.js'
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
      if (options.interactive !== false && !isCI()) {
        const shouldContinue = await prompt<{ continue: boolean }>({
          type: 'confirm',
          name: 'continue',
          message: 'You have uncommitted changes. Continue anyway?',
          initial: false,
        })
        
        if (!(shouldContinue as any).continue) {
          logger.warning('Please commit or stash your changes before releasing')
          exitProcess(1)
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
        message: 'Select version bump type:',
        choices: versionOptions,
        initial: changeAnalysis.versionBump === 'patch' ? 0 : changeAnalysis.versionBump === 'minor' ? 1 : 2,
      })
      
      versionType = (versionChoice as any).version
    } else if (!versionType) {
      // Non-interactive mode - analyze changes
      changeAnalysis = await git.analyzeChangesForVersionBump()
      versionType = changeAnalysis.versionBump
      logger.info(`🔍 Auto-detected ${versionType} release`)
    }
    
    const newVersion = semver.inc(currentVersion, versionType!)
    if (!newVersion) {
      logger.error(`Invalid version calculation from ${currentVersion}`)
      exitProcess(1)
    }
    
    logger.info(`\n📈 Version: ${currentVersion} → ${newVersion}`)
    
    // Interactive deployment options
    let shouldDeploy = options.deploy
    let shouldPublishNpm = options.npm
    
    if (options.interactive !== false && !isCI()) {
      // Ask about GitHub release
      if (options.github !== false && config.github?.autoRelease) {
        const githubChoice = await prompt<{ github: boolean }>({
          type: 'confirm',
          name: 'github',
          message: 'Create GitHub release?',
          initial: config.github?.autoRelease || false,
        })
        options.github = (githubChoice as any).github
      }
      
      // Ask about deployment
      if (shouldDeploy === undefined && config.deployments && config.deployments.length > 0) {
        const deployChoice = await prompt<{ deploy: boolean }>({
          type: 'confirm',
          name: 'deploy',
          message: `Deploy to ${config.deployments.length} target(s) after release?`,
          initial: false,
        })
        shouldDeploy = (deployChoice as any).deploy
      }
      
      // Ask about npm publishing
      if (shouldPublishNpm === undefined && config.npm?.autoPublish !== false) {
        const npm = createNpmPublisher(config.npm)
        const packageInfo = npm.getPackageInfo()
        
        if (packageInfo && !npm.isPrivatePackage()) {
          const npmChoice = await prompt<{ npm: boolean }>({
            type: 'confirm',
            name: 'npm',
            message: 'Publish to npm?',
            initial: config.npm?.autoPublish || false,
          })
          shouldPublishNpm = (npmChoice as any).npm
        }
      }
      
      // Final confirmation
      const summary = [
        `🏷️  Version: ${currentVersion} → ${newVersion}`,
        `📦 GitHub release: ${options.github !== false ? 'Yes' : 'No'}`,
        shouldDeploy ? `🚀 Deploy: Yes (${config.deployments?.length || 0} targets)` : '🚀 Deploy: No',
        shouldPublishNpm ? '📦 NPM publish: Yes' : '📦 NPM publish: No',
      ]
      
      logger.info('\n📋 Release Summary:')
      summary.forEach(item => logger.info(`   ${item}`))
      
      const finalConfirm = await prompt<{ proceed: boolean }>({
        type: 'confirm',
        name: 'proceed',
        message: `\nProceed with ${versionType} release?`,
        initial: true,
      })
      
      if (!(finalConfirm as any).proceed) {
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
      const publishResult = await npm.publishPackage()
      
      if (publishResult.success) {
        logger.success(`✅ Published ${publishResult.version} to ${publishResult.registry}`)
      } else {
        logger.error(`❌ Failed to publish: ${publishResult.error}`)
      }
    }
    
    // Show final summary
    logger.section('\n🎉 Release Complete!')
    logger.success(`✅ Released version ${result.version.to} in ${timer.elapsedFormatted()}`)
    
    if (result.actions.length > 0) {
      logger.info('\n📋 Actions completed:')
      result.actions.forEach(action => {
        const status = action.success ? '✅' : '❌'
        logger.info(`   ${status} ${action.name}`)
      })
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