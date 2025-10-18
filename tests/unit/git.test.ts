/**
 * Unit tests for Git operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGitOperations, GitOperations } from '@/git/index.js'
import { createTempDir, cleanupTempDir, createMockGitRepo, createMockPackageJson } from '@tests/setup.js'

describe('GitOperations', () => {
  let tempDir: string
  let git: GitOperations

  beforeEach(() => {
    tempDir = createTempDir()
    createMockGitRepo(tempDir)
    createMockPackageJson(tempDir, { version: '1.0.0' })
    git = createGitOperations(tempDir)
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  describe('isGitRepository', () => {
    it('should return true for a git repository', async () => {
      const result = await git.isGitRepository()
      expect(result).toBe(true)
    })

    it('should return false for non-git directory', async () => {
      const nonGitDir = createTempDir('non-git-')
      const nonGitOps = createGitOperations(nonGitDir)
      
      const result = await nonGitOps.isGitRepository()
      expect(result).toBe(false)
      
      cleanupTempDir(nonGitDir)
    })
  })

  describe('getCurrentVersion', () => {
    it('should read version from package.json', () => {
      const version = git.getCurrentVersion()
      expect(version).toBe('1.0.0')
    })

    it('should return 0.0.0 if no package.json exists', () => {
      const emptyDir = createTempDir('empty-')
      const emptyGit = createGitOperations(emptyDir)
      
      const version = emptyGit.getCurrentVersion()
      expect(version).toBe('0.0.0')
      
      cleanupTempDir(emptyDir)
    })
  })

  describe('updatePackageVersion', () => {
    it('should update package.json version', () => {
      git.updatePackageVersion('1.1.0')
      
      const updatedVersion = git.getCurrentVersion()
      expect(updatedVersion).toBe('1.1.0')
    })
  })

  describe('analyzeChangesForVersionBump', () => {
    beforeEach(() => {
      // Mock simple-git methods
      vi.mock('simple-git', () => ({
        simpleGit: vi.fn().mockReturnValue({
          log: vi.fn().mockResolvedValue({
            all: [
              {
                hash: 'abc123',
                message: 'feat: add new feature',
                author_name: 'Test Author',
                author_email: 'test@example.com',
                date: '2023-01-01',
              },
              {
                hash: 'def456',
                message: 'fix: resolve bug',
                author_name: 'Test Author',
                author_email: 'test@example.com',
                date: '2023-01-01',
              },
            ],
          }),
          status: vi.fn().mockResolvedValue({
            files: [
              { path: 'src/file1.ts' },
              { path: 'src/file2.ts' },
            ],
          }),
          tags: vi.fn().mockResolvedValue({ all: [] }),
        }),
      }))
    })

    it('should detect minor version bump for features', async () => {
      const analysis = await git.analyzeChangesForVersionBump()
      
      expect(analysis.versionBump).toBe('minor')
      expect(analysis.hasFeatures).toBe(true)
      expect(analysis.hasFixes).toBe(true)
      expect(analysis.hasBreaking).toBe(false)
    })

    it('should detect major version bump for breaking changes', async () => {
      // Mock breaking change commit
      vi.mocked(git['git'].log).mockResolvedValue({
        all: [
          {
            hash: 'abc123',
            message: 'feat!: breaking change',
            author_name: 'Test Author',
            author_email: 'test@example.com',
            date: '2023-01-01',
          },
        ],
      })

      const analysis = await git.analyzeChangesForVersionBump()
      
      expect(analysis.versionBump).toBe('major')
      expect(analysis.hasBreaking).toBe(true)
    })
  })

  describe('createTag', () => {
    it('should create a simple tag', async () => {
      const mockAddTag = vi.fn().mockResolvedValue(undefined)
      vi.mocked(git['git'].addTag).mockImplementation(mockAddTag)

      await git.createTag('v1.0.0')
      
      expect(mockAddTag).toHaveBeenCalledWith('v1.0.0')
    })

    it('should create an annotated tag with message', async () => {
      const mockAddAnnotatedTag = vi.fn().mockResolvedValue(undefined)
      vi.mocked(git['git'].addAnnotatedTag).mockImplementation(mockAddAnnotatedTag)

      await git.createTag('v1.0.0', 'Release v1.0.0')
      
      expect(mockAddAnnotatedTag).toHaveBeenCalledWith('v1.0.0', 'Release v1.0.0')
    })
  })

  describe('branch operations', () => {
    beforeEach(() => {
      vi.mocked(git['git'].branch).mockResolvedValue({ current: 'main' })
      vi.mocked(git['git'].branchLocal).mockResolvedValue({ all: ['main', 'feature'] })
    })

    it('should get current branch', async () => {
      const branch = await git.getCurrentBranch()
      expect(branch).toBe('main')
    })

    it('should check if branch exists', async () => {
      const exists = await git.branchExists('feature')
      expect(exists).toBe(true)
      
      const notExists = await git.branchExists('nonexistent')
      expect(notExists).toBe(false)
    })

    it('should create a new branch', async () => {
      const mockCheckoutLocalBranch = vi.fn().mockResolvedValue(undefined)
      vi.mocked(git['git'].checkoutLocalBranch).mockImplementation(mockCheckoutLocalBranch)

      await git.createBranch('new-feature')
      
      expect(mockCheckoutLocalBranch).toHaveBeenCalledWith('new-feature')
    })
  })

  describe('commit operations', () => {
    it('should stage files', async () => {
      const mockAdd = vi.fn().mockResolvedValue(undefined)
      vi.mocked(git['git'].add).mockImplementation(mockAdd)

      await git.stageFiles(['file1.ts', 'file2.ts'])
      
      expect(mockAdd).toHaveBeenCalledWith(['file1.ts', 'file2.ts'])
    })

    it('should create commit', async () => {
      const mockCommit = vi.fn().mockResolvedValue({ commit: 'abc123def456' })
      vi.mocked(git['git'].commit).mockImplementation(mockCommit)

      const hash = await git.commit('feat: add new feature')
      
      expect(mockCommit).toHaveBeenCalledWith('feat: add new feature')
      expect(hash).toBe('abc123d')
    })
  })

  describe('remote operations', () => {
    it('should push to remote', async () => {
      const mockPush = vi.fn().mockResolvedValue(undefined)
      vi.mocked(git['git'].push).mockImplementation(mockPush)

      await git.push('origin', 'main')
      
      expect(mockPush).toHaveBeenCalledWith('origin', 'main')
    })

    it('should push tags', async () => {
      const mockPushTags = vi.fn().mockResolvedValue(undefined)
      vi.mocked(git['git'].pushTags).mockImplementation(mockPushTags)

      await git.pushTags('origin')
      
      expect(mockPushTags).toHaveBeenCalledWith('origin')
    })

    it('should get remote URL', async () => {
      const mockGetRemotes = vi.fn().mockResolvedValue([
        {
          name: 'origin',
          refs: {
            fetch: 'https://github.com/user/repo.git',
            push: 'https://github.com/user/repo.git',
          },
        },
      ])
      vi.mocked(git['git'].getRemotes).mockImplementation(mockGetRemotes)

      const url = await git.getRemoteUrl('origin')
      
      expect(url).toBe('https://github.com/user/repo.git')
    })
  })

  describe('status operations', () => {
    it('should check uncommitted changes', async () => {
      const mockStatus = vi.fn().mockResolvedValue({
        files: [{ path: 'modified-file.ts' }],
      })
      vi.mocked(git['git'].status).mockImplementation(mockStatus)

      const hasChanges = await git.hasUncommittedChanges()
      
      expect(hasChanges).toBe(true)
    })

    it('should return false for clean working directory', async () => {
      const mockStatus = vi.fn().mockResolvedValue({ files: [] })
      vi.mocked(git['git'].status).mockImplementation(mockStatus)

      const hasChanges = await git.hasUncommittedChanges()
      
      expect(hasChanges).toBe(false)
    })
  })
})