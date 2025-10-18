/**
 * Test setup and utilities
 */

import { vi } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'

// Global test configuration
export const TEST_TIMEOUT = 30000

// Create temporary directory for tests
export function createTempDir(prefix: string = 'go-workflow-test-'): string {
  const tempId = randomBytes(8).toString('hex')
  const tempPath = join(tmpdir(), `${prefix}${tempId}`)
  
  if (!existsSync(tempPath)) {
    mkdirSync(tempPath, { recursive: true })
  }
  
  return tempPath
}

// Clean up temporary directory
export function cleanupTempDir(tempPath: string): void {
  if (existsSync(tempPath)) {
    rmSync(tempPath, { recursive: true, force: true })
  }
}

// Create a mock Git repository
export function createMockGitRepo(baseDir: string): string {
  const gitDir = join(baseDir, '.git')
  mkdirSync(gitDir, { recursive: true })
  
  // Create basic Git structure
  writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n')
  writeFileSync(join(gitDir, 'config'), '[core]\n\trepositoryformatversion = 0\n')
  
  const refsDir = join(gitDir, 'refs', 'heads')
  mkdirSync(refsDir, { recursive: true })
  writeFileSync(join(refsDir, 'main'), 'abc123def456789\n')
  
  return baseDir
}

// Create a mock package.json
export function createMockPackageJson(dir: string, content: any = {}): void {
  const packageJson = {
    name: 'test-package',
    version: '1.0.0',
    description: 'Test package',
    main: 'index.js',
    scripts: {
      build: 'echo "building"',
      test: 'echo "testing"',
      lint: 'echo "linting"',
    },
    ...content,
  }
  
  writeFileSync(join(dir, 'package.json'), JSON.stringify(packageJson, null, 2))
}

// Mock external commands
export function mockExternalCommands() {
  vi.mock('execa', () => ({
    execa: vi.fn().mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    }),
  }))
}

// Mock file system operations
export function mockFileSystem() {
  vi.mock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    return {
      ...actual,
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue('{}'),
      existsSync: vi.fn().mockReturnValue(true),
    }
  })
}

// Mock simple-git
export function mockSimpleGit() {
  vi.mock('simple-git', () => ({
    simpleGit: vi.fn().mockReturnValue({
      init: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue({ commit: 'abc123def456' }),
      push: vi.fn().mockResolvedValue(undefined),
      pushTags: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue({ files: [] }),
      branch: vi.fn().mockResolvedValue({ current: 'main' }),
      log: vi.fn().mockResolvedValue({ all: [] }),
      tags: vi.fn().mockResolvedValue({ all: [] }),
      addTag: vi.fn().mockResolvedValue(undefined),
      addAnnotatedTag: vi.fn().mockResolvedValue(undefined),
      revparse: vi.fn().mockResolvedValue(''),
      checkout: vi.fn().mockResolvedValue(undefined),
      checkoutLocalBranch: vi.fn().mockResolvedValue(undefined),
      deleteLocalBranch: vi.fn().mockResolvedValue(undefined),
      branchLocal: vi.fn().mockResolvedValue({ all: [] }),
      getRemotes: vi.fn().mockResolvedValue([]),
      diff: vi.fn().mockResolvedValue(''),
      raw: vi.fn().mockResolvedValue(''),
      getConfig: vi.fn().mockResolvedValue(''),
      addConfig: vi.fn().mockResolvedValue(undefined),
    }),
  }))
}

// Mock enquirer prompts
export function mockEnquirer() {
  vi.mock('enquirer', () => ({
    prompt: vi.fn().mockResolvedValue({}),
  }))
}

// Mock process exit
export function mockProcessExit() {
  const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  return mockExit
}

// Test data factories
export function createMockCommit(overrides: Partial<any> = {}) {
  return {
    hash: 'abc123def456789',
    message: 'feat: add new feature',
    author: 'Test Author',
    email: 'test@example.com',
    date: new Date('2023-01-01'),
    ...overrides,
  }
}

export function createMockConfig(overrides: Partial<any> = {}) {
  return {
    name: 'test-project',
    defaultBranch: 'main',
    deployments: [],
    changelog: {
      path: 'CHANGELOG.md',
      includeTypes: ['feat', 'fix'],
      sections: [
        { title: 'Features', types: ['feat'] },
        { title: 'Bug Fixes', types: ['fix'] },
      ],
    },
    github: {
      autoRelease: true,
      autoMerge: false,
      labels: ['enhancement'],
    },
    npm: {
      access: 'public',
      autoPublish: false,
    },
    ...overrides,
  }
}

// Console mocking
export function mockConsole() {
  const consoleMock = {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  
  vi.stubGlobal('console', consoleMock)
  
  return consoleMock
}

// Timer utilities
export function advanceTime(ms: number) {
  vi.advanceTimersByTime(ms)
}

// Setup global mocks
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllTimers()
})

// Cleanup any temp directories created during tests
const tempDirs: string[] = []

export function registerTempDir(dir: string) {
  tempDirs.push(dir)
}

afterAll(() => {
  tempDirs.forEach(dir => {
    try {
      cleanupTempDir(dir)
    } catch {
      // Ignore cleanup errors
    }
  })
})