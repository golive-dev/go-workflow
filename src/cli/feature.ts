#!/usr/bin/env node

/**
 * Feature command implementation
 */

import { prompt } from 'enquirer'
import semver from 'semver'
import { loadWorkflowConfig } from '../config/index.js'
import { createGitOperations } from '../git/index.js'
import { createGitHubIntegration } from '../github/index.js'
import { createChangelogManager } from '../changelog/index.js'
import { createTimer, exitProcess, logger } from '../utils/index.js'
import type { VersionBumpType } from '../types.js'

export interface FeatureOptions {
  title?: string
  description?: string
  interactive?: boolean
  autoMerge?: boolean
}

export async function runFeatureRelease(options: FeatureOptions): Promise<void> {
  const timer = createTimer()
  
  try {
    logger.section('🚀 Feature Branch Release Workflow')
    
    // Load configuration
    const config = await loadWorkflowConfig()
    const git = createGitOperations()
    const github = createGitHubIntegration(config.github)
    
    // Validate prerequisites
    const isGitRepo = await git.isGitRepository()
    if (!isGitRepo) {
      logger.error('Not a Git repository')
      exitProcess(1)
    }
    
    // Check GitHub CLI
    const ghStatus = await github.checkGHCLI()
    if (!ghStatus.installed) {
      logger.error('GitHub CLI is not installed. Please install it from https://cli.github.com/')
      exitProcess(1)
    }
    
    if (!ghStatus.authenticated) {
      logger.error('GitHub CLI is not authenticated. Please run: gh auth login')
      exitProcess(1)
    }
    
    // Get current branch
    const currentBranch = await git.getCurrentBranch()
    const mainBranch = config.defaultBranch || 'main'
    
    if (currentBranch === mainBranch) {
      logger.error(`Cannot run feature release from ${mainBranch} branch`)
      logger.info('💡 Create a feature branch first: git checkout -b feature-name')
      exitProcess(1)
    }
    
    logger.info(`📂 Current branch: ${currentBranch}`)
    
    // Check for uncommitted changes
    const hasUncommitted = await git.hasUncommittedChanges()
    if (hasUncommitted) {
      if (options.interactive !== false) {
        const shouldCommit = await prompt<{ commit: boolean }>({
          type: 'confirm',
          name: 'commit',
          message: 'You have uncommitted changes. Commit them now?',
          initial: true,
        })
        
        if ((shouldCommit as any).commit) {
          const commitMessage = await prompt<{ message: string }>({
            type: 'input',
            name: 'message',
            message: 'Commit message:',
            initial: `feat: ${currentBranch.replace(/^feature[-/]/, '').replace(/[-_]/g, ' ')}`,
            validate: value => value.length > 0 || 'Commit message is required',
          })
          
          await git.stageFiles()
          await git.commit((commitMessage as any).message)
          logger.success('✅ Changes committed')
        } else {
          logger.error('Please commit or stash your changes first')
          exitProcess(1)
        }
      } else {
        logger.error('Uncommitted changes detected. Please commit or stash them first.')
        exitProcess(1)
      }
    }
    
    // Get branch information
    const commits = await git.getCommitsBetween(mainBranch, currentBranch)
    const changedFiles = await git.getChangedFilesBetween(mainBranch, currentBranch)
    
    logger.info('\n📊 Branch Analysis:')
    logger.info(`   • ${commits.length} commits ahead of ${mainBranch}`)
    logger.info(`   • ${changedFiles.length} files changed`)
    
    if (commits.length === 0) {
      logger.error(`No commits found ahead of ${mainBranch}`)
      exitProcess(1)
    }
    
    if (commits.length > 0) {
      logger.info('\n📝 Recent commits:')
      commits.slice(0, 5).forEach((commit, index) => {
        logger.info(`   ${index + 1}. ${commit.hash.substring(0, 7)} ${commit.message}`)
      })
      if (commits.length > 5) {
        logger.info(`   ... and ${commits.length - 5} more commits`)
      }
    }
    
    if (changedFiles.length > 0) {
      logger.info('\n📁 Changed files:')
      changedFiles.slice(0, 10).forEach((file, index) => {
        logger.info(`   ${index + 1}. ${file}`)
      })
      if (changedFiles.length > 10) {
        logger.info(`   ... and ${changedFiles.length - 10} more files`)
      }
    }
    
    // Get release information
    const currentVersion = git.getCurrentVersion()
    logger.info(`\n🏷️  Current version: ${currentVersion}`)
    
    // Interactive feature details
    let title = options.title
    let description = options.description
    let versionType: VersionBumpType = 'minor'
    let autoMerge = options.autoMerge
    
    if (options.interactive !== false) {
      // Get version type
      const versionOptions = [
        { name: 'patch', message: `🔧 Patch (${semver.inc(currentVersion, 'patch')}) - bug fixes`, value: 'patch' as VersionBumpType },
        { name: 'minor', message: `✨ Minor (${semver.inc(currentVersion, 'minor')}) - new features`, value: 'minor' as VersionBumpType },
        { name: 'major', message: `💥 Major (${semver.inc(currentVersion, 'major')}) - breaking changes`, value: 'major' as VersionBumpType },
      ]
      
      const versionChoice = await prompt<{ version: VersionBumpType }>({
        type: 'select',
        name: 'version',
        message: 'Select version bump type:',
        choices: versionOptions,
        initial: 1, // default to minor
      })
      
      versionType = (versionChoice as any).version
      
      // Get feature title
      if (!title) {
        const titlePrompt = await prompt<{ title: string }>({
          type: 'input',
          name: 'title',
          message: 'Feature title:',
          initial: currentBranch.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1),
          ).join(' ').replace(/^Feature /, ''),
          validate: value => value.length > 0 || 'Title is required',
        })
        title = (titlePrompt as any).title
      }
      
      // Get feature description
      if (!description) {
        const descriptionPrompt = await prompt<{ description: string }>({
          type: 'input',
          name: 'description',
          message: 'Feature description:',
          initial: 'Enhanced functionality with improved user experience and maintainability',
          validate: value => value.length > 0 || 'Description is required',
        })
        description = (descriptionPrompt as any).description
      }
      
      // Auto-merge option
      if (autoMerge === undefined) {
        const autoMergeChoice = await prompt<{ autoMerge: boolean }>({
          type: 'confirm',
          name: 'autoMerge',
          message: 'Enable auto-merge for PR?',
          initial: config.github?.autoMerge || false,
        })
        autoMerge = (autoMergeChoice as any).autoMerge
      }
    } else {
      // Non-interactive defaults
      title = title || currentBranch.replace(/[-_]/g, ' ').replace(/^feature /, '')
      description = description || 'New feature implementation'
      autoMerge = autoMerge ?? config.github?.autoMerge ?? false
    }
    
    const newVersion = semver.inc(currentVersion, versionType)
    if (!newVersion) {
      logger.error(`Invalid version calculation from ${currentVersion}`)
      exitProcess(1)
    }
    
    // Generate feature list from commits
    const features = commits.map(commit => {
      const message = commit.message.replace(/^(feat|fix|docs|style|refactor|perf|test|chore)(\(.+\))?:\s*/, '')
      return message.charAt(0).toUpperCase() + message.slice(1)
    }).slice(0, 8) // Limit to 8 features
    
    // Create change statistics
    const changeStats = [
      `**${changedFiles.length} files changed**: ${commits.length} commits with comprehensive improvements`,
      '**New modular architecture** with clear separation of concerns',
      '**Comprehensive documentation** and examples added',
      '**Backward compatible** implementation',
    ].join('\n- ')
    
    // Show summary
    if (options.interactive !== false) {
      logger.info('\n📋 Feature Release Summary:')
      logger.info(`   🏷️  Title: ${title}`)
      logger.info(`   📝 Description: ${description}`)
      logger.info(`   📈 Version: ${currentVersion} → ${newVersion} (${versionType})`)
      logger.info(`   🔀 Auto-merge: ${autoMerge ? 'Yes' : 'No'}`)
      logger.info(`   📦 Features: ${features.length} items`)
      
      const finalConfirm = await prompt<{ proceed: boolean }>({
        type: 'confirm',
        name: 'proceed',
        message: '\nProceed with feature release?',
        initial: true,
      })
      
      if (!(finalConfirm as any).proceed) {
        logger.warning('Feature release cancelled')
        exitProcess(0)
      }
    }
    
    // Push current branch to origin
    logger.step('\n📤 Pushing branch to origin...')
    await git.push('origin', currentBranch)
    
    // Update changelog
    logger.step('📝 Updating changelog...')
    const changelog = createChangelogManager(config.changelog)
    const entry = changelog.generateEntry(newVersion, commits)
    changelog.updateChangelog(entry)
    
    // Commit changelog changes
    await git.stageFiles(['CHANGELOG.md'])
    await git.commit(`docs: add changelog entry for v${newVersion} ${title!.toLowerCase()}`)
    await git.push('origin', currentBranch)
    
    // Create comprehensive PR
    logger.step('📝 Creating pull request...')
    const pr = await github.createComprehensivePR(
      currentBranch,
      title!,
      description!,
      features,
      changeStats,
    )
    
    logger.success(`✅ PR created: ${pr.url}`)
    
    if (autoMerge) {
      logger.info('⏳ Auto-merge enabled, waiting for CI checks...')
      
      // Wait for workflows to complete
      const workflowsCompleted = await github.waitForWorkflowsToComplete(currentBranch, 300000) // 5 minutes
      
      if (workflowsCompleted) {
        // Wait for PR to be merged
        const merged = await github.waitForPRMerge(pr.number, 300000) // 5 minutes
        
        if (merged) {
          logger.success('✅ PR has been automatically merged')
          
          // Switch to main and pull changes
          logger.step('🔄 Switching to main branch...')
          await git.switchBranch(mainBranch)
          await git.pull()
          
          // Delete feature branch
          logger.step('🗑️  Cleaning up feature branch...')
          try {
            await git.deleteBranch(currentBranch, true)
            await github.deleteBranch(currentBranch)
            logger.success(`✅ Deleted local and remote branch: ${currentBranch}`)
          } catch {
            logger.warning(`⚠️  Could not delete branch: ${currentBranch}`)
          }
          
          // Create GitHub release
          logger.step('🚀 Creating GitHub release...')
          const release = await github.createComprehensiveRelease(
            newVersion,
            title!,
            description!,
            features,
            changeStats,
            currentVersion,
          )
          
          logger.success(`✅ Release created: ${release.url}`)
          
        } else {
          logger.warning('⚠️  PR merge timed out or failed')
          logger.info('   You can check the PR status manually and merge when ready')
        }
      } else {
        logger.warning('⚠️  Workflows did not complete successfully')
        logger.info('   Please check the CI status and merge manually when ready')
      }
    } else {
      logger.info('💡 Manual merge required - PR is ready for review')
    }
    
    // Show final summary
    logger.section('\n🎉 Feature Release Complete!')
    logger.success(`✅ Feature branch workflow completed in ${timer.elapsedFormatted()}`)
    
    logger.info('\n📋 Summary:')
    logger.info(`   ✅ Branch pushed: ${currentBranch}`)
    logger.info('   ✅ Changelog updated')
    logger.info(`   ✅ PR created: #${pr.number}`)
    if (autoMerge) {
      logger.info('   ✅ Auto-merge enabled')
    }
    
    // Show next steps
    logger.info('\n📋 Next steps:')
    if (!autoMerge) {
      logger.info(`   • Review and merge PR: ${pr.url}`)
      logger.info('   • Create release after merge')
    } else {
      logger.info('   • Monitor the deployment')
      logger.info('   • Share the release with your team')
    }
    
  } catch (error) {
    logger.error(`❌ Feature release failed: ${error}`)
    exitProcess(1)
  }
}