/**
 * Changelog management for workflow automation
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChangelogConfig, GitCommit } from '../types.js'
import { logger } from '../utils/index.js'

export interface ChangelogEntry {
  version: string
  date: string
  sections: ChangelogSection[]
  breaking?: string[]
  migration?: string[]
}

export interface ChangelogSection {
  title: string
  items: string[]
}

export class ChangelogManager {
  private config: ChangelogConfig
  private cwd: string
  private changelogPath: string

  constructor(config: ChangelogConfig = {}, cwd: string = process.cwd()) {
    this.config = {
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
      ...config,
    }
    this.cwd = cwd
    this.changelogPath = join(cwd, this.config.path ?? 'CHANGELOG.md')
  }

  /**
   * Parse commits into changelog sections
   */
  parseCommits(commits: GitCommit[]): ChangelogSection[] {
    const sections: Map<string, string[]> = new Map()
    const breaking: string[] = []

    // Initialize sections
    this.config.sections?.forEach(section => {
      sections.set(section.title, [])
    })

    for (const commit of commits) {
      const message = commit.message.trim()
      const type = this.extractCommitType(message)
      
      // Skip if type is excluded
      if (this.config.excludeTypes?.includes(type)) {
        continue
      }
      
      // Only include if type is in includeTypes (if specified)
      if (this.config.includeTypes && !this.config.includeTypes.includes(type)) {
        continue
      }

      // Check for breaking changes
      if (this.isBreakingChange(message)) {
        const breakingDescription = this.extractBreakingDescription(message)
        breaking.push(breakingDescription || message)
      }

      // Find appropriate section
      const section = this.config.sections?.find(s => s.types.includes(type))
      if (section) {
        const cleanMessage = this.cleanCommitMessage(message, type)
        sections.get(section.title)?.push(`- ${cleanMessage}`)
      }
    }

    // Convert to array and filter empty sections
    const result: ChangelogSection[] = []
    sections.forEach((items, title) => {
      if (items.length > 0) {
        result.push({ title, items })
      }
    })

    // Add breaking changes section if present
    if (breaking.length > 0) {
      result.unshift({
        title: 'BREAKING CHANGES',
        items: breaking.map(item => `- ${item}`),
      })
    }

    return result
  }

  /**
   * Extract commit type from conventional commit message
   */
  private extractCommitType(message: string): string {
    const match = message.match(/^(\w+)(\(.+\))?!?:\s/)
    return match?.[1] ?? 'other'
  }

  /**
   * Check if commit contains breaking changes
   */
  private isBreakingChange(message: string): boolean {
    return (
      message.includes('BREAKING CHANGE:') ||
      message.includes('!:') ||
      /^\w+(\(.+\))?!:/.test(message)
    )
  }

  /**
   * Extract breaking change description
   */
  private extractBreakingDescription(message: string): string | null {
    const breakingMatch = message.match(/BREAKING CHANGE:\s*(.+)/)
    if (breakingMatch && breakingMatch[1]) {
      return breakingMatch[1]
    }
    
    // For ! syntax, use the main message
    if (message.includes('!:')) {
      return message.replace(/^\w+(\(.+\))?!:\s*/, '')
    }
    
    return null
  }

  /**
   * Clean commit message for changelog display
   */
  private cleanCommitMessage(message: string, type: string): string {
    // Remove type prefix
    let cleaned = message.replace(new RegExp(`^${type}(\\(.+\\))?!?:\\s*`), '')
    
    // Remove breaking change footer
    cleaned = cleaned.replace(/\n\nBREAKING CHANGE:.*$/s, '')
    
    // Capitalize first letter if not empty
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    }
    
    // Ensure it ends with a period
    if (!cleaned.endsWith('.') && !cleaned.endsWith('!') && !cleaned.endsWith('?')) {
      cleaned += '.'
    }
    
    return cleaned
  }

  /**
   * Generate changelog entry for a version
   */
  generateEntry(version: string, commits: GitCommit[], releaseDate?: Date): ChangelogEntry {
    const sections = this.parseCommits(commits)
    const date = releaseDate ? this.formatDate(releaseDate) : this.formatDate(new Date())

    return {
      version,
      date,
      sections,
    }
  }

  /**
   * Format date for changelog
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0] ?? ''
  }

  /**
   * Read existing changelog
   */
  readChangelog(): string {
    if (!existsSync(this.changelogPath)) {
      return this.createInitialChangelog()
    }
    
    return readFileSync(this.changelogPath, 'utf-8')
  }

  /**
   * Create initial changelog structure
   */
  private createInitialChangelog(): string {
    return `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

`
  }

  /**
   * Format changelog entry as markdown
   */
  formatEntry(entry: ChangelogEntry): string {
    let content = `## [${entry.version}] - ${entry.date}\n\n`

    for (const section of entry.sections) {
      content += `### ${section.title}\n\n`
      for (const item of section.items) {
        content += `${item}\n`
      }
      content += '\n'
    }

    return content
  }

  /**
   * Update changelog with new entry
   */
  updateChangelog(entry: ChangelogEntry): void {
    const existingContent = this.readChangelog()
    const newEntry = this.formatEntry(entry)

    // Find the position to insert the new entry
    // Look for "## [Unreleased]" and insert after it
    const unreleasedMatch = existingContent.match(/(## \[Unreleased\]\s*\n)(.*?)(\n## |\n*$)/s)
    
    let updatedContent: string

    if (unreleasedMatch) {
      const index = unreleasedMatch.index ?? 0
      const beforeLength = unreleasedMatch[1]?.length ?? 0
      const beforeUnreleased = existingContent.substring(0, index + beforeLength)
      const unreleasedContent = unreleasedMatch[2] || ''
      const afterIndex = (unreleasedMatch.index ?? 0) + unreleasedMatch[0].length - (unreleasedMatch[3]?.length ?? 0)
      const afterUnreleased = existingContent.substring(afterIndex)
      
      updatedContent = `${beforeUnreleased}${unreleasedContent}\n${newEntry}${afterUnreleased}`
    } else {
      // Fallback: insert after the header
      const headerMatch = existingContent.match(/^(# Changelog.*?\n\n)(.*)/s)
      if (headerMatch) {
        const header = headerMatch[1]
        const rest = headerMatch[2]
        updatedContent = `${header}## [Unreleased]\n\n${newEntry}${rest}`
      } else {
        updatedContent = `${this.createInitialChangelog()}${newEntry}`
      }
    }

    this.writeChangelog(updatedContent)
    logger.success(`Updated changelog with version ${entry.version}`)
  }

  /**
   * Write changelog to file
   */
  private writeChangelog(content: string): void {
    writeFileSync(this.changelogPath, content, 'utf-8')
  }

  /**
   * Add unreleased section if it doesn't exist
   */
  ensureUnreleasedSection(): void {
    const content = this.readChangelog()
    
    if (!content.includes('## [Unreleased]')) {
      const headerMatch = content.match(/^(# Changelog.*?\n\n)/s)
      if (headerMatch && headerMatch[1]) {
        const updatedContent = `${headerMatch[1]}## [Unreleased]\n\n${content.substring(headerMatch[1].length)}`
        this.writeChangelog(updatedContent)
        logger.info('Added Unreleased section to changelog')
      }
    }
  }

  /**
   * Generate full changelog from commits
   */
  generateFullChangelog(
    commits: GitCommit[],
    versions: Array<{ version: string; date: Date; commits: GitCommit[] }>,
  ): string {
    let content = this.createInitialChangelog()

    for (const versionInfo of versions) {
      const entry = this.generateEntry(versionInfo.version, versionInfo.commits, versionInfo.date)
      content += this.formatEntry(entry)
    }

    return content
  }

  /**
   * Get version entries from existing changelog
   */
  getVersionEntries(): Array<{ version: string; date: string }> {
    const content = this.readChangelog()
    const versionPattern = /## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})/g
    const versions: Array<{ version: string; date: string }> = []
    
    let match
    while ((match = versionPattern.exec(content)) !== null) {
      if (match[1] && match[2] && match[1] !== 'Unreleased') {
        versions.push({
          version: match[1],
          date: match[2],
        })
      }
    }

    return versions
  }

  /**
   * Validate changelog format
   */
  validateChangelog(): { isValid: boolean; errors: string[] } {
    const errors: string[] = []
    
    try {
      const content = this.readChangelog()
      
      // Check for required header
      if (!content.includes('# Changelog')) {
        errors.push('Missing "# Changelog" header')
      }
      
      // Check for unreleased section
      if (!content.includes('## [Unreleased]')) {
        errors.push('Missing "## [Unreleased]" section')
      }
      
      // Validate version format
      const versionPattern = /## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})/g
      let match
      while ((match = versionPattern.exec(content)) !== null) {
        const version = match[1]
        const date = match[2]
        
        if (version && version !== 'Unreleased' && !/^\d+\.\d+\.\d+/.test(version)) {
          errors.push(`Invalid version format: ${version}`)
        }
        
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          errors.push(`Invalid date format: ${date}`)
        }
      }
      
    } catch (error) {
      errors.push(`Failed to read changelog: ${error}`)
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }
}

/**
 * Create a new ChangelogManager instance
 */
export function createChangelogManager(config?: ChangelogConfig, cwd?: string): ChangelogManager {
  return new ChangelogManager(config, cwd)
}

/**
 * Quick function to update changelog with new version
 */
export async function updateChangelogWithVersion(
  version: string,
  commits: GitCommit[],
  config?: ChangelogConfig,
  cwd?: string,
): Promise<void> {
  const manager = createChangelogManager(config, cwd)
  const entry = manager.generateEntry(version, commits)
  manager.updateChangelog(entry)
}