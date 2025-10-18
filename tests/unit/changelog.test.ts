/**
 * Unit tests for Changelog management
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createChangelogManager, ChangelogManager } from '@/changelog/index.js'
import { createTempDir, cleanupTempDir, createMockCommit } from '@tests/setup.js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('ChangelogManager', () => {
  let tempDir: string
  let changelog: ChangelogManager

  beforeEach(() => {
    tempDir = createTempDir()
    changelog = createChangelogManager(
      {
        path: 'CHANGELOG.md',
        includeTypes: ['feat', 'fix', 'perf', 'refactor', 'docs'],
        sections: [
          { title: 'Features', types: ['feat'] },
          { title: 'Bug Fixes', types: ['fix'] },
          { title: 'Performance', types: ['perf'] },
          { title: 'Refactoring', types: ['refactor'] },
          { title: 'Documentation', types: ['docs'] },
        ],
      },
      tempDir
    )
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  describe('parseCommits', () => {
    it('should parse conventional commits correctly', () => {
      const commits = [
        createMockCommit({ message: 'feat: add new feature' }),
        createMockCommit({ message: 'fix: resolve critical bug' }),
        createMockCommit({ message: 'docs: update README' }),
        createMockCommit({ message: 'chore: update dependencies' }),
      ]

      const sections = changelog.parseCommits(commits)

      expect(sections).toHaveLength(3) // feat, fix, docs (chore excluded by config)
      
      const featSection = sections.find(s => s.title === 'Features')
      expect(featSection?.items).toContain('- Add new feature.')
      
      const fixSection = sections.find(s => s.title === 'Bug Fixes')
      expect(fixSection?.items).toContain('- Resolve critical bug.')
      
      const docsSection = sections.find(s => s.title === 'Documentation')
      expect(docsSection?.items).toContain('- Update README.')
    })

    it('should detect breaking changes', () => {
      const commits = [
        createMockCommit({ message: 'feat!: breaking API change' }),
        createMockCommit({ message: 'feat: add feature\n\nBREAKING CHANGE: Old API removed' }),
      ]

      const sections = changelog.parseCommits(commits)
      
      const breakingSection = sections.find(s => s.title === 'BREAKING CHANGES')
      expect(breakingSection).toBeDefined()
      expect(breakingSection?.items).toContain('- feat!: breaking API change')
      expect(breakingSection?.items).toContain('- Old API removed')
    })

    it('should handle commit scopes', () => {
      const commits = [
        createMockCommit({ message: 'feat(api): add new endpoint' }),
        createMockCommit({ message: 'fix(ui): resolve layout issue' }),
      ]

      const sections = changelog.parseCommits(commits)
      
      const featSection = sections.find(s => s.title === 'Features')
      expect(featSection?.items).toContain('- Add new endpoint.')
      
      const fixSection = sections.find(s => s.title === 'Bug Fixes')
      expect(fixSection?.items).toContain('- Resolve layout issue.')
    })

    it('should exclude specified commit types', () => {
      const changelogWithExclusions = createChangelogManager({
        excludeTypes: ['chore', 'test'],
        sections: [
          { title: 'Features', types: ['feat'] },
        ],
      }, tempDir)

      const commits = [
        createMockCommit({ message: 'feat: add feature' }),
        createMockCommit({ message: 'chore: update deps' }),
        createMockCommit({ message: 'test: add tests' }),
      ]

      const sections = changelogWithExclusions.parseCommits(commits)
      
      expect(sections).toHaveLength(1)
      expect(sections[0].title).toBe('Features')
    })
  })

  describe('generateEntry', () => {
    it('should generate changelog entry with version and date', () => {
      const commits = [
        createMockCommit({ message: 'feat: add new feature' }),
        createMockCommit({ message: 'fix: resolve bug' }),
      ]

      const entry = changelog.generateEntry('1.1.0', commits)

      expect(entry.version).toBe('1.1.0')
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.sections).toHaveLength(2)
    })

    it('should use custom release date if provided', () => {
      const commits = [createMockCommit({ message: 'feat: add feature' })]
      const releaseDate = new Date('2023-12-25')

      const entry = changelog.generateEntry('1.1.0', commits, releaseDate)

      expect(entry.date).toBe('2023-12-25')
    })
  })

  describe('formatEntry', () => {
    it('should format changelog entry as markdown', () => {
      const entry = {
        version: '1.1.0',
        date: '2023-01-01',
        sections: [
          {
            title: 'Features',
            items: ['- Add new API endpoint.', '- Improve performance.'],
          },
          {
            title: 'Bug Fixes',
            items: ['- Fix critical security issue.'],
          },
        ],
      }

      const formatted = changelog.formatEntry(entry)

      expect(formatted).toContain('## [1.1.0] - 2023-01-01')
      expect(formatted).toContain('### Features')
      expect(formatted).toContain('- Add new API endpoint.')
      expect(formatted).toContain('- Improve performance.')
      expect(formatted).toContain('### Bug Fixes')
      expect(formatted).toContain('- Fix critical security issue.')
    })
  })

  describe('readChangelog', () => {
    it('should create initial changelog if none exists', () => {
      const content = changelog.readChangelog()
      
      expect(content).toContain('# Changelog')
      expect(content).toContain('## [Unreleased]')
      expect(content).toContain('Keep a Changelog')
      expect(content).toContain('Semantic Versioning')
    })

    it('should read existing changelog', () => {
      // Create an existing changelog
      const existingContent = `# Changelog

## [Unreleased]

## [1.0.0] - 2023-01-01

### Features
- Initial release.
`
      
      const changelogPath = join(tempDir, 'CHANGELOG.md')
      require('node:fs').writeFileSync(changelogPath, existingContent)

      const content = changelog.readChangelog()
      
      expect(content).toBe(existingContent)
    })
  })

  describe('updateChangelog', () => {
    it('should update changelog with new entry', () => {
      const commits = [createMockCommit({ message: 'feat: add feature' })]
      const entry = changelog.generateEntry('1.1.0', commits)
      
      changelog.updateChangelog(entry)
      
      const changelogPath = join(tempDir, 'CHANGELOG.md')
      expect(existsSync(changelogPath)).toBe(true)
      
      const content = readFileSync(changelogPath, 'utf-8')
      expect(content).toContain('## [1.1.0]')
      expect(content).toContain('### Features')
      expect(content).toContain('- Add feature.')
    })

    it('should preserve unreleased section', () => {
      // Create initial changelog with unreleased changes
      const initialContent = `# Changelog

## [Unreleased]

### Features
- Unreleased feature.

## [1.0.0] - 2023-01-01

### Features
- Initial release.
`
      
      const changelogPath = join(tempDir, 'CHANGELOG.md')
      require('node:fs').writeFileSync(changelogPath, initialContent)

      const commits = [createMockCommit({ message: 'fix: bug fix' })]
      const entry = changelog.generateEntry('1.0.1', commits)
      
      changelog.updateChangelog(entry)
      
      const content = readFileSync(changelogPath, 'utf-8')
      expect(content).toContain('## [Unreleased]')
      expect(content).toContain('- Unreleased feature.')
      expect(content).toContain('## [1.0.1]')
      expect(content).toContain('- Bug fix.')
    })
  })

  describe('validateChangelog', () => {
    it('should validate correct changelog format', () => {
      const validContent = `# Changelog

## [Unreleased]

## [1.0.0] - 2023-01-01

### Features
- Initial release.
`
      
      const changelogPath = join(tempDir, 'CHANGELOG.md')
      require('node:fs').writeFileSync(changelogPath, validContent)

      const validation = changelog.validateChangelog()
      
      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('should detect invalid changelog format', () => {
      const invalidContent = `Invalid Changelog

## [1.0.0] - invalid-date

### Features
- Feature without proper format.
`
      
      const changelogPath = join(tempDir, 'CHANGELOG.md')
      require('node:fs').writeFileSync(changelogPath, invalidContent)

      const validation = changelog.validateChangelog()
      
      expect(validation.isValid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
      expect(validation.errors.some(e => e.includes('Missing "# Changelog" header'))).toBe(true)
      expect(validation.errors.some(e => e.includes('Missing "## [Unreleased]" section'))).toBe(true)
    })
  })

  describe('getVersionEntries', () => {
    it('should extract version entries from changelog', () => {
      const content = `# Changelog

## [Unreleased]

## [1.1.0] - 2023-02-01

### Features
- New feature.

## [1.0.0] - 2023-01-01

### Features
- Initial release.
`
      
      const changelogPath = join(tempDir, 'CHANGELOG.md')
      require('node:fs').writeFileSync(changelogPath, content)

      const versions = changelog.getVersionEntries()
      
      expect(versions).toHaveLength(2)
      expect(versions[0]).toEqual({ version: '1.1.0', date: '2023-02-01' })
      expect(versions[1]).toEqual({ version: '1.0.0', date: '2023-01-01' })
    })

    it('should exclude unreleased section', () => {
      const content = `# Changelog

## [Unreleased]

### Features
- Upcoming feature.

## [1.0.0] - 2023-01-01

### Features
- Initial release.
`
      
      const changelogPath = join(tempDir, 'CHANGELOG.md')
      require('node:fs').writeFileSync(changelogPath, content)

      const versions = changelog.getVersionEntries()
      
      expect(versions).toHaveLength(1)
      expect(versions[0]).toEqual({ version: '1.0.0', date: '2023-01-01' })
    })
  })
})