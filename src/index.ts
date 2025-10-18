/**
 * Go Corp Workflow - Comprehensive workflow automation
 * 
 * This package provides a complete workflow automation solution for Go Corp projects,
 * including release management, CI/CD integration, and deployment orchestration.
 */

// Core types
export type * from './types.js'

// Utilities
export * from './utils/index.js'

// Configuration
export * from './config/index.js'

// Git operations
export * from './git/index.js'

// Changelog management
export {
  ChangelogManager,
  createChangelogManager,
  updateChangelogWithVersion,
  type ChangelogEntry,
} from './changelog/index.js'

// GitHub integration
export * from './github/index.js'

// CLI components (for programmatic usage)
export { default as program } from './cli/index.js'

/**
 * Main workflow orchestration class
 */
import { createGitOperations } from './git/index.js'
import { createChangelogManager } from './changelog/index.js'
import { createGitHubIntegration } from './github/index.js'
import { loadWorkflowConfig } from './config/index.js'
import type { ReleaseContext, VersionBumpType, WorkflowConfig, WorkflowResult } from './types.js'
import { createTimer, logger } from './utils/index.js'
import semver from 'semver'

export class Workflow {
  private config: WorkflowConfig
  private git: ReturnType<typeof createGitOperations>
  private changelog: ReturnType<typeof createChangelogManager>
  private github: ReturnType<typeof createGitHubIntegration>
  private cwd: string

  constructor(config?: WorkflowConfig, cwd: string = process.cwd()) {
    this.cwd = cwd
    this.config = config || {} as WorkflowConfig
    this.git = createGitOperations(cwd)
    this.changelog = createChangelogManager(this.config.changelog, cwd)
    this.github = createGitHubIntegration(this.config.github, cwd)
  }

  /**
   * Initialize workflow with configuration
   */
  static async create(cwd?: string): Promise<Workflow> {
    const config = await loadWorkflowConfig(cwd)
    return new Workflow(config, cwd)
  }

  /**
   * Execute a complete release workflow
   */
  async executeRelease(
    versionType?: VersionBumpType,
    options: {
      deploy?: boolean
      createGitHubRelease?: boolean
      publishNpm?: boolean
      interactive?: boolean
    } = {},
  ): Promise<WorkflowResult> {
    const timer = createTimer()
    const actions: WorkflowResult['actions'] = []
    const errors: string[] = []

    try {
      logger.section('🚀 Starting Release Workflow')

      // Check prerequisites
      const isGitRepo = await this.git.isGitRepository()
      if (!isGitRepo) {
        throw new Error('Not a Git repository')
      }

      // Get current state
      const currentVersion = this.git.getCurrentVersion()
      const currentBranch = await this.git.getCurrentBranch()
      const hasUncommitted = await this.git.hasUncommittedChanges()

      if (hasUncommitted && options.interactive === false) {
        throw new Error('Uncommitted changes detected. Please commit or stash them first.')
      }

      // Analyze changes if version type not specified
      let finalVersionType = versionType
      if (!finalVersionType) {
        const analysis = await this.git.analyzeChangesForVersionBump()
        finalVersionType = analysis.versionBump
        logger.info(`Recommended version bump: ${finalVersionType}`)
      }

      // Calculate new version
      const newVersion = semver.inc(currentVersion, finalVersionType)
      if (!newVersion) {
        throw new Error(`Invalid version calculation from ${currentVersion}`)
      }

      logger.info(`Version: ${currentVersion} → ${newVersion}`)

      // Create release context
      const commits = await this.git.getCommitsSince()
      const changedFiles = await this.git.getChangedFiles()
      
      const context: ReleaseContext = {
        currentVersion,
        newVersion,
        versionType: finalVersionType,
        releaseType: 'standard',
        branch: currentBranch,
        changedFiles,
        commits,
        config: this.config,
      }

      // Execute release steps
      await this.executeReleaseSteps(context, options, actions)

      const result: WorkflowResult = {
        success: true,
        version: {
          from: currentVersion,
          to: newVersion,
          type: finalVersionType,
        },
        actions,
        deployments: [],
        errors,
        duration: timer.elapsed(),
      }

      logger.success(`✅ Release completed in ${timer.elapsedFormatted()}`)
      return result

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
      logger.error(`❌ Release failed: ${error}`)

      return {
        success: false,
        version: {
          from: this.git.getCurrentVersion(),
          to: '',
          type: versionType || 'patch',
        },
        actions,
        deployments: [],
        errors,
        duration: timer.elapsed(),
      }
    }
  }

  /**
   * Execute the individual release steps
   */
  private async executeReleaseSteps(
    context: ReleaseContext,
    options: Parameters<typeof this.executeRelease>[1] = {},
    actions: WorkflowResult['actions'],
  ): Promise<void> {
    const actionTimer = createTimer()

    // Update package version
    try {
      this.git.updatePackageVersion(context.newVersion)
      actions.push({
        type: 'git',
        name: 'Update package version',
        success: true,
        duration: actionTimer.elapsed(),
      })
    } catch (error) {
      actions.push({
        type: 'git',
        name: 'Update package version',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: actionTimer.elapsed(),
      })
      throw error
    }

    // Update changelog
    actionTimer.lap()
    try {
      const entry = this.changelog.generateEntry(context.newVersion, context.commits)
      this.changelog.updateChangelog(entry)
      actions.push({
        type: 'changelog',
        name: 'Update changelog',
        success: true,
        duration: actionTimer.elapsed(),
      })
    } catch (error) {
      actions.push({
        type: 'changelog',
        name: 'Update changelog',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: actionTimer.elapsed(),
      })
      throw error
    }

    // Commit changes
    actionTimer.lap()
    try {
      await this.git.stageFiles(['package.json', 'CHANGELOG.md'])
      await this.git.commit(`chore: release v${context.newVersion}`)
      actions.push({
        type: 'git',
        name: 'Commit changes',
        success: true,
        duration: actionTimer.elapsed(),
      })
    } catch (error) {
      actions.push({
        type: 'git',
        name: 'Commit changes',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: actionTimer.elapsed(),
      })
      throw error
    }

    // Create and push tag
    actionTimer.lap()
    try {
      const tagName = `${this.config.git?.tagPrefix || 'v'}${context.newVersion}`
      await this.git.createTag(tagName, `Release ${context.newVersion}`)
      await this.git.push()
      if (this.config.git?.pushTags !== false) {
        await this.git.pushTags()
      }
      actions.push({
        type: 'git',
        name: 'Create and push tag',
        success: true,
        duration: actionTimer.elapsed(),
      })
    } catch (error) {
      actions.push({
        type: 'git',
        name: 'Create and push tag',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: actionTimer.elapsed(),
      })
      throw error
    }

    // Create GitHub release
    if (options.createGitHubRelease !== false && this.config.github?.autoRelease) {
      actionTimer.lap()
      try {
        const ghStatus = await this.github.checkGHCLI()
        if (ghStatus.installed && ghStatus.authenticated) {
          await this.github.createRelease({
            title: `v${context.newVersion}`,
            body: `Release v${context.newVersion}`,
            tag: `v${context.newVersion}`,
            prerelease: false,
            generateNotes: true,
          })
          actions.push({
            type: 'github',
            name: 'Create GitHub release',
            success: true,
            duration: actionTimer.elapsed(),
          })
        } else {
          logger.warning('GitHub CLI not available, skipping release creation')
        }
      } catch (error) {
        actions.push({
          type: 'github',
          name: 'Create GitHub release',
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: actionTimer.elapsed(),
        })
        logger.warning(`Failed to create GitHub release: ${error}`)
      }
    }
  }

  /**
   * Get workflow status
   */
  async getStatus() {
    const git = await this.git.isGitRepository()
    const currentVersion = git ? this.git.getCurrentVersion() : null
    const currentBranch = git ? await this.git.getCurrentBranch() : null
    const hasUncommitted = git ? await this.git.hasUncommittedChanges() : false
    const ghStatus = await this.github.checkGHCLI()

    return {
      git: {
        isRepository: git,
        currentVersion,
        currentBranch,
        hasUncommitted,
      },
      github: ghStatus,
      config: this.config,
    }
  }
}

/**
 * Create a new Workflow instance
 */
export async function createWorkflow(cwd?: string): Promise<Workflow> {
  return await Workflow.create(cwd)
}

/**
 * Quick release function
 */
export async function quickRelease(
  versionType: VersionBumpType = 'patch',
  options?: Parameters<Workflow['executeRelease']>[1],
  cwd?: string,
): Promise<WorkflowResult> {
  const workflow = await createWorkflow(cwd)
  return await workflow.executeRelease(versionType, options)
}