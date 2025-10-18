/**
 * Git operations for workflow automation
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'
import { simpleGit, type SimpleGit } from 'simple-git'
import type { ChangeAnalysis, GitCommit, VersionBumpType } from '../types.js'
import { logger, retry } from '../utils/index.js'

export class GitOperations {
  private git: SimpleGit
  private cwd: string

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd
    this.git = simpleGit(cwd)
  }

  /**
   * Check if the current directory is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir'])
      return true
    } catch {
      return false
    }
  }

  /**
   * Initialize a new git repository
   */
  async initRepository(): Promise<void> {
    await this.git.init()
    logger.success('Initialized git repository')
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const result = await this.git.branch()
      return result.current || 'main'
    } catch {
      return 'main'
    }
  }

  /**
   * Check if there are uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    try {
      const status = await this.git.status()
      return status.files.length > 0
    } catch {
      return false
    }
  }

  /**
   * Get list of changed files
   */
  async getChangedFiles(): Promise<string[]> {
    try {
      const status = await this.git.status()
      return status.files.map(file => file.path)
    } catch {
      return []
    }
  }

  /**
   * Stage files for commit
   */
  async stageFiles(files: string[] = ['.']): Promise<void> {
    await this.git.add(files)
    logger.info(`Staged ${files.length === 1 && files[0] === '.' ? 'all changes' : files.join(', ')}`)
  }

  /**
   * Commit changes with message
   */
  async commit(message: string): Promise<string> {
    const result = await this.git.commit(message)
    const hash = result.commit.substring(0, 7)
    logger.success(`Committed: ${hash} ${message}`)
    return hash
  }

  /**
   * Push changes to remote
   */
  async push(remote: string = 'origin', branch?: string): Promise<void> {
    const currentBranch = branch || await this.getCurrentBranch()
    
    await retry(async () => {
      await this.git.push(remote, currentBranch)
    }, 3)
    
    logger.success(`Pushed to ${remote}/${currentBranch}`)
  }

  /**
   * Push tags to remote
   */
  async pushTags(remote: string = 'origin'): Promise<void> {
    await retry(async () => {
      await this.git.pushTags(remote)
    }, 3)
    
    logger.success(`Pushed tags to ${remote}`)
  }

  /**
   * Create and push a git tag
   */
  async createTag(tag: string, message?: string): Promise<void> {
    if (message) {
      await this.git.addAnnotatedTag(tag, message)
    } else {
      await this.git.addTag(tag)
    }
    
    logger.success(`Created tag: ${tag}`)
  }

  /**
   * Get the latest tag
   */
  async getLatestTag(): Promise<string | null> {
    try {
      const tags = await this.git.tags()
      const validTags = tags.all
        .filter(tag => semver.valid(tag.replace(/^v/, '')))
        .sort((a, b) => semver.rcompare(a.replace(/^v/, ''), b.replace(/^v/, '')))
      
      return validTags[0] || null
    } catch {
      return null
    }
  }

  /**
   * Get commits since a specific tag or commit
   */
  async getCommitsSince(since?: string): Promise<GitCommit[]> {
    try {
      const latestTag = since || await this.getLatestTag()
      const range = latestTag ? `${latestTag}..HEAD` : ''
      
      const log = range ? await this.git.log({ from: range }) : await this.git.log()
      
      return log.all.map(commit => ({
        hash: commit.hash,
        message: commit.message,
        author: commit.author_name,
        email: commit.author_email,
        date: new Date(commit.date),
      }))
    } catch {
      return []
    }
  }

  /**
   * Get commits between two branches
   */
  async getCommitsBetween(baseBranch: string, targetBranch: string): Promise<GitCommit[]> {
    try {
      const log = await this.git.log({ from: baseBranch, to: targetBranch })
      
      return log.all.map(commit => ({
        hash: commit.hash,
        message: commit.message,
        author: commit.author_name,
        email: commit.author_email,
        date: new Date(commit.date),
      }))
    } catch {
      return []
    }
  }

  /**
   * Get changed files between branches
   */
  async getChangedFilesBetween(baseBranch: string, targetBranch: string): Promise<string[]> {
    try {
      const result = await this.git.diff([`${baseBranch}...${targetBranch}`, '--name-only'])
      return result.split('\n').filter(Boolean)
    } catch {
      return []
    }
  }

  /**
   * Analyze changes and recommend version bump
   */
  async analyzeChangesForVersionBump(since?: string): Promise<ChangeAnalysis> {
    const commits = await this.getCommitsSince(since)
    const changedFiles = await this.getChangedFiles()
    
    let hasBreaking = false
    let hasFeatures = false
    let hasFixes = false
    const changesList: string[] = []
    
    // Analyze commit messages
    for (const commit of commits) {
      const message = commit.message.toLowerCase()
      
      // Check for breaking changes
      if (message.includes('breaking') || message.includes('!:') || message.startsWith('!')) {
        hasBreaking = true
        changesList.push(`BREAKING: ${commit.message}`)
        continue
      }
      
      // Check for features
      if (message.startsWith('feat')) {
        hasFeatures = true
        changesList.push(`Feature: ${commit.message.replace(/^feat:?\s*/, '')}`)
        continue
      }
      
      // Check for fixes
      if (message.startsWith('fix')) {
        hasFixes = true
        changesList.push(`Fix: ${commit.message.replace(/^fix:?\s*/, '')}`)
        continue
      }
      
      // Other changes
      if (message.startsWith('docs')) {
        changesList.push(`Documentation: ${commit.message.replace(/^docs:?\s*/, '')}`)
      } else if (message.startsWith('refactor')) {
        changesList.push(`Refactor: ${commit.message.replace(/^refactor:?\s*/, '')}`)
      } else if (message.startsWith('perf')) {
        hasFeatures = true // Performance improvements are features
        changesList.push(`Performance: ${commit.message.replace(/^perf:?\s*/, '')}`)
      } else {
        changesList.push(commit.message)
      }
    }
    
    // Determine version bump type
    let versionBump: VersionBumpType = 'patch'
    let changeType = 'patch'
    
    if (hasBreaking) {
      versionBump = 'major'
      changeType = 'major'
    } else if (hasFeatures) {
      versionBump = 'minor'
      changeType = 'minor'
    }
    
    return {
      versionBump,
      changeType,
      changesList,
      changedFiles,
      commits,
      hasBreaking,
      hasFeatures,
      hasFixes,
    }
  }

  /**
   * Check if a branch exists locally
   */
  async branchExists(branchName: string): Promise<boolean> {
    try {
      const branches = await this.git.branchLocal()
      return branches.all.includes(branchName)
    } catch {
      return false
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(branchName: string, checkout: boolean = true): Promise<void> {
    if (checkout) {
      await this.git.checkoutLocalBranch(branchName)
    } else {
      await this.git.branch([branchName])
    }
    
    logger.success(`Created branch: ${branchName}`)
  }

  /**
   * Switch to a branch
   */
  async switchBranch(branchName: string): Promise<void> {
    await this.git.checkout(branchName)
    logger.info(`Switched to branch: ${branchName}`)
  }

  /**
   * Delete a branch
   */
  async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
    try {
      await this.git.deleteLocalBranch(branchName, force)
      logger.success(`Deleted branch: ${branchName}`)
    } catch (error) {
      if (force) {
        await this.git.raw(['branch', '-D', branchName])
        logger.success(`Force deleted branch: ${branchName}`)
      } else {
        throw error
      }
    }
  }

  /**
   * Pull changes from remote
   */
  async pull(remote: string = 'origin', branch?: string): Promise<void> {
    const currentBranch = branch || await this.getCurrentBranch()
    
    await retry(async () => {
      await this.git.pull(remote, currentBranch)
    }, 3)
    
    logger.success(`Pulled from ${remote}/${currentBranch}`)
  }

  /**
   * Get remote URL
   */
  async getRemoteUrl(remote: string = 'origin'): Promise<string | null> {
    try {
      const remotes = await this.git.getRemotes(true)
      const remoteInfo = remotes.find(r => r.name === remote)
      return remoteInfo?.refs?.fetch || null
    } catch {
      return null
    }
  }

  /**
   * Get current version from package.json
   */
  getCurrentVersion(): string {
    try {
      const packagePath = join(this.cwd, 'package.json')
      if (existsSync(packagePath)) {
        const packageJson = JSON.parse(execSync(`cat ${packagePath}`, { encoding: 'utf8' }))
        return packageJson.version || '0.0.0'
      }
      return '0.0.0'
    } catch {
      return '0.0.0'
    }
  }

  /**
   * Update version in package.json
   */
  updatePackageVersion(newVersion: string): void {
    try {
      const packagePath = join(this.cwd, 'package.json')
      if (existsSync(packagePath)) {
        const packageJson = JSON.parse(execSync(`cat ${packagePath}`, { encoding: 'utf8' }))
        packageJson.version = newVersion
        
        execSync(`echo '${JSON.stringify(packageJson, null, 2)}' > ${packagePath}`)
        logger.success(`Updated package.json version to ${newVersion}`)
      }
    } catch (error) {
      throw new Error(`Failed to update package.json: ${error}`)
    }
  }

  /**
   * Check if working directory is clean
   */
  async isWorkingDirectoryClean(): Promise<boolean> {
    try {
      const status = await this.git.status()
      return status.files.length === 0
    } catch {
      return false
    }
  }

  /**
   * Get git configuration
   */
  async getConfig(key: string): Promise<string | null> {
    try {
      const config = await this.git.getConfig(key)
      return typeof config === 'string' ? config : null
    } catch {
      return null
    }
  }

  /**
   * Set git configuration
   */
  async setConfig(key: string, value: string, global: boolean = false): Promise<void> {
    if (global) {
      await this.git.addConfig(key, value, false, 'global')
    } else {
      await this.git.addConfig(key, value)
    }
  }
}

/**
 * Create a new GitOperations instance
 */
export function createGitOperations(cwd?: string): GitOperations {
  return new GitOperations(cwd)
}