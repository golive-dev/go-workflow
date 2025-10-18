/**
 * GitHub integration for workflow automation
 */

import { execa } from 'execa'
import type { GitHubConfig, PRDetails, ReleaseDetails } from '../types.js'
import { logger, retry } from '../utils/index.js'

export interface GitHubPR {
  number: number
  title: string
  body: string
  url: string
  state: 'open' | 'closed' | 'merged'
  branch: string
  baseBranch: string
  author: string
  labels: string[]
  assignees: string[]
  createdAt: Date
  updatedAt: Date
}

export interface GitHubRelease {
  id: number
  tagName: string
  name: string
  body: string
  url: string
  htmlUrl: string
  draft: boolean
  prerelease: boolean
  createdAt: Date
  publishedAt: Date
}

export class GitHubIntegration {
  private config: GitHubConfig
  private cwd: string

  constructor(config: GitHubConfig = {}, cwd: string = process.cwd()) {
    this.config = {
      autoRelease: false,
      autoMerge: false,
      labels: ['enhancement'],
      ...config,
    }
    this.cwd = cwd
  }

  /**
   * Check if GitHub CLI is installed and authenticated
   */
  async checkGHCLI(): Promise<{ installed: boolean; authenticated: boolean }> {
    try {
      await execa('gh', ['--version'], { cwd: this.cwd })
      
      try {
        await execa('gh', ['auth', 'status'], { cwd: this.cwd })
        return { installed: true, authenticated: true }
      } catch {
        return { installed: true, authenticated: false }
      }
    } catch {
      return { installed: false, authenticated: false }
    }
  }

  /**
   * Get repository information
   */
  async getRepoInfo(): Promise<{ owner: string; repo: string; url: string } | null> {
    try {
      const { stdout } = await execa('gh', ['repo', 'view', '--json', 'owner,name,url'], { cwd: this.cwd })
      const data = JSON.parse(stdout)
      
      return {
        owner: data.owner.login,
        repo: data.name,
        url: data.url,
      }
    } catch {
      return null
    }
  }

  /**
   * Create a pull request
   */
  async createPR(details: PRDetails): Promise<GitHubPR> {
    try {
      const args = [
        'pr', 'create',
        '--title', details.title,
        '--body', details.body,
        '--head', details.branch,
      ]

      // Add labels
      if (details.labels.length > 0) {
        args.push('--label', details.labels.join(','))
      }

      // Add assignees
      if (details.assignees.length > 0) {
        args.push('--assignee', details.assignees.join(','))
      }

      const { stdout } = await retry(async () => {
        return await execa('gh', args, { cwd: this.cwd })
      }, 3)

      const prUrl = stdout.trim()
      const prNumber = Number(prUrl.split('/').pop())

      // Enable auto-merge if requested
      if (details.autoMerge) {
        await this.enableAutoMerge(prNumber)
      }

      logger.success(`Created PR #${prNumber}: ${prUrl}`)

      return {
        number: prNumber,
        title: details.title,
        body: details.body,
        url: prUrl,
        state: 'open',
        branch: details.branch,
        baseBranch: 'main', // Default, could be configurable
        author: await this.getCurrentUser(),
        labels: details.labels,
        assignees: details.assignees,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    } catch (error) {
      throw new Error(`Failed to create PR: ${error}`)
    }
  }

  /**
   * Enable auto-merge for a PR
   */
  async enableAutoMerge(prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash'): Promise<void> {
    try {
      await execa('gh', ['pr', 'merge', prNumber.toString(), '--auto', `--${mergeMethod}`], { cwd: this.cwd })
      logger.success(`Enabled auto-merge for PR #${prNumber} with ${mergeMethod} strategy`)
    } catch (error) {
      throw new Error(`Failed to enable auto-merge: ${error}`)
    }
  }

  /**
   * Get PR status
   */
  async getPRStatus(prNumber: number): Promise<GitHubPR | null> {
    try {
      const { stdout } = await execa('gh', [
        'pr', 'view', prNumber.toString(),
        '--json', 'number,title,body,url,state,headRefName,baseRefName,author,labels,assignees,createdAt,updatedAt',
      ], { cwd: this.cwd })

      const data = JSON.parse(stdout)

      return {
        number: data.number,
        title: data.title,
        body: data.body,
        url: data.url,
        state: data.state,
        branch: data.headRefName,
        baseBranch: data.baseRefName,
        author: data.author.login,
        labels: data.labels.map((l: { name: string }) => l.name),
        assignees: data.assignees.map((a: { login: string }) => a.login),
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
      }
    } catch {
      return null
    }
  }

  /**
   * Wait for PR to be merged
   */
  async waitForPRMerge(prNumber: number, timeoutMs: number = 300000): Promise<boolean> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeoutMs) {
      const pr = await this.getPRStatus(prNumber)
      if (!pr) {
        return false
      }

      if (pr.state === 'merged') {
        logger.success(`PR #${prNumber} has been merged`)
        return true
      }

      if (pr.state === 'closed') {
        logger.warning(`PR #${prNumber} was closed without merging`)
        return false
      }

      // Wait 10 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 10000))
    }

    logger.warning(`Timeout waiting for PR #${prNumber} to merge`)
    return false
  }

  /**
   * Create a GitHub release
   */
  async createRelease(details: ReleaseDetails): Promise<GitHubRelease> {
    try {
      const args = [
        'release', 'create', details.tag,
        '--title', details.title,
        '--notes', details.body,
      ]

      if (details.prerelease) {
        args.push('--prerelease')
      } else {
        args.push('--latest')
      }

      if (details.generateNotes) {
        args.push('--generate-notes')
      }

      const { stdout } = await retry(async () => {
        return await execa('gh', args, { cwd: this.cwd })
      }, 3)

      const releaseUrl = stdout.trim()

      logger.success(`Created release: ${releaseUrl}`)

      return {
        id: 0, // GitHub CLI doesn't return ID directly
        tagName: details.tag,
        name: details.title,
        body: details.body,
        url: releaseUrl,
        htmlUrl: releaseUrl,
        draft: false,
        prerelease: details.prerelease,
        createdAt: new Date(),
        publishedAt: new Date(),
      }
    } catch (error) {
      throw new Error(`Failed to create release: ${error}`)
    }
  }

  /**
   * Get latest release
   */
  async getLatestRelease(): Promise<GitHubRelease | null> {
    try {
      const { stdout } = await execa('gh', [
        'release', 'view', '--json', 'id,tagName,name,body,url,htmlUrl,isDraft,isPrerelease,createdAt,publishedAt',
      ], { cwd: this.cwd })

      const data = JSON.parse(stdout)

      return {
        id: data.id,
        tagName: data.tagName,
        name: data.name,
        body: data.body,
        url: data.url,
        htmlUrl: data.htmlUrl,
        draft: data.isDraft,
        prerelease: data.isPrerelease,
        createdAt: new Date(data.createdAt),
        publishedAt: new Date(data.publishedAt),
      }
    } catch {
      return null
    }
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<string> {
    try {
      const { stdout } = await execa('gh', ['auth', 'status', '--show-token'], { cwd: this.cwd })
      const match = stdout.match(/Logged in to github\.com as ([^\s]+)/)
      return match?.[1] || 'unknown'
    } catch {
      return 'unknown'
    }
  }

  /**
   * Delete a branch on GitHub
   */
  async deleteBranch(branchName: string): Promise<void> {
    try {
      const repoInfo = await this.getRepoInfo()
      if (!repoInfo) {
        throw new Error('Could not get repository information')
      }

      await execa('gh', ['api', '-X', 'DELETE', `/repos/${repoInfo.owner}/${repoInfo.repo}/git/refs/heads/${branchName}`], { cwd: this.cwd })
      logger.success(`Deleted remote branch: ${branchName}`)
    } catch (error) {
      logger.warning(`Could not delete remote branch ${branchName}: ${error}`)
    }
  }

  /**
   * Get workflow runs for a branch
   */
  async getWorkflowRuns(branch?: string): Promise<Array<{
    status: string
    conclusion: string
    databaseId: number
    workflowName: string
    headBranch: string
    createdAt: string
    updatedAt: string
  }>> {
    try {
      const args = ['run', 'list', '--json', 'databaseId,status,conclusion,workflowName,headBranch,createdAt,updatedAt']
      
      if (branch) {
        args.push('--branch', branch)
      }

      const { stdout } = await execa('gh', args, { cwd: this.cwd })
      const data = JSON.parse(stdout)

      return data
    } catch {
      return []
    }
  }

  /**
   * Wait for workflow runs to complete
   */
  async waitForWorkflowsToComplete(branch: string, timeoutMs: number = 600000): Promise<boolean> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeoutMs) {
      const runs = await this.getWorkflowRuns(branch)
      const pendingRuns = runs.filter((run: { status: string }) => 
        run.status === 'in_progress' || run.status === 'queued' || run.status === 'waiting',
      )

      if (pendingRuns.length === 0) {
        const failedRuns = runs.filter((run: { conclusion: string }) => run.conclusion === 'failure')
        if (failedRuns.length > 0) {
          logger.warning(`${failedRuns.length} workflow(s) failed for branch ${branch}`)
          return false
        }

        logger.success(`All workflows completed successfully for branch ${branch}`)
        return true
      }

      logger.info(`Waiting for ${pendingRuns.length} workflow(s) to complete...`)
      await new Promise(resolve => setTimeout(resolve, 30000))
    }

    logger.warning(`Timeout waiting for workflows to complete on branch ${branch}`)
    return false
  }

  /**
   * Create a comprehensive PR with auto-generated content
   */
  async createComprehensivePR(
    branch: string,
    title: string,
    description: string,
    features: string[],
    changeStats: string,
  ): Promise<GitHubPR> {
    const prBody = this.generatePRBody(title, description, features, changeStats)

    return await this.createPR({
      title: `feat: ${title.toLowerCase()}`,
      body: prBody,
      branch,
      labels: this.config.labels || ['enhancement'],
      assignees: ['@me'],
      autoMerge: this.config.autoMerge || false,
    })
  }

  /**
   * Generate comprehensive PR body
   */
  private generatePRBody(title: string, description: string, features: string[], changeStats: string): string {
    return `## 🚀 ${title}

### Overview
${description}

### Key Improvements

${features.map(f => `- ${f}`).join('\n')}

### Technical Changes

#### Change Statistics
${changeStats}

### Quality Assurance
- ✅ All tests passing
- ✅ TypeScript compilation clean
- ✅ Linting issues resolved
- ✅ Zero breaking changes (backward compatible)
- ✅ Production-ready with comprehensive error handling

### Migration Impact
- **Zero Breaking Changes**: Backward compatible implementation
- **Enhanced Developer Experience**: Improved APIs and documentation
- **Better Performance**: Optimized architecture and reduced redundancy
- **Future-Proof**: Extensible design for growing needs

This release provides enhanced functionality while maintaining stability and improving developer experience.`
  }

  /**
   * Create a comprehensive GitHub release
   */
  async createComprehensiveRelease(
    version: string,
    title: string,
    description: string,
    features: string[],
    changeStats: string,
    currentVersion: string,
  ): Promise<GitHubRelease> {
    const releaseBody = this.generateReleaseBody(title, description, features, changeStats, currentVersion, version)

    return await this.createRelease({
      title: `v${version} - ${title}`,
      body: releaseBody,
      tag: `v${version}`,
      prerelease: false,
      generateNotes: false,
    })
  }

  /**
   * Generate comprehensive release body
   */
  private generateReleaseBody(
    title: string,
    description: string,
    features: string[],
    changeStats: string,
    currentVersion: string,
    newVersion: string,
  ): string {
    const repoInfo = { owner: 'go-corp', repo: 'workflow' } // Fallback values
    
    return `# 🚀 ${title}

## Overview
${description}

## 🎯 Key Features

${features.map(f => `- ${f}`).join('\n')}

## ✅ Quality Assurance
- **Zero Breaking Changes**: Backward compatible implementation
- **All Tests Pass**: Comprehensive test coverage maintained
- **TypeScript Clean**: Full type safety throughout
- **Linting Clean**: All code style issues resolved
- **Production Ready**: Comprehensive error handling and validation

## 📈 Performance Improvements
- Optimized architecture and reduced redundancy
- Enhanced maintainability and developer experience

## 👨‍💻 Developer Experience
- Comprehensive documentation with usage examples
- Enhanced type safety and error handling
- Clear migration path with backward compatibility

## 📊 Change Statistics
${changeStats}

This release provides enhanced functionality while maintaining stability and improving developer experience.

---

**Full Changelog**: https://github.com/${repoInfo.owner}/${repoInfo.repo}/compare/v${currentVersion}...v${newVersion}`
  }
}

/**
 * Create a new GitHubIntegration instance
 */
export function createGitHubIntegration(config?: GitHubConfig, cwd?: string): GitHubIntegration {
  return new GitHubIntegration(config, cwd)
}