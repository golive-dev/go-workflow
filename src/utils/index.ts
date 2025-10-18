/**
 * Utility functions for the workflow system
 */

import chalk from 'chalk'
import ora, { type Ora } from 'ora'

// ANSI color codes for environments without chalk support
export const COLORS = {
  reset: '\x1B[0m',
  bright: '\x1B[1m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  blue: '\x1B[34m',
  magenta: '\x1B[35m',
  cyan: '\x1B[36m',
} as const

/**
 * Enhanced logging with colors and icons
 */
export const logger = {
  info: (message: string) => console.log(chalk.blue(`ℹ️  ${  message}`)),
  success: (message: string) => console.log(chalk.green(`✅ ${  message}`)),
  warning: (message: string) => console.log(chalk.yellow(`⚠️  ${  message}`)),
  error: (message: string) => console.log(chalk.red(`❌ ${  message}`)),
  debug: (message: string) => console.log(chalk.gray(`🔍 ${  message}`)),
  
  // Workflow specific loggers
  step: (message: string) => console.log(chalk.cyan(`🚀 ${  message}`)),
  section: (message: string) => {
    console.log()
    console.log(chalk.bold.cyan(`┌─ ${message}`)) 
    console.log(chalk.cyan('│'))
  },
  
  // Enhanced section closer
  sectionEnd: () => console.log(chalk.cyan('└─')),
  
  // Bullet point lists
  bullet: (message: string, level: number = 0) => {
    const indent = '  '.repeat(level)
    console.log(chalk.dim(`${indent}• ${message}`))
  },
  
  // Raw logging for output without formatting
  raw: (message: string) => console.log(message),
  
  // Spinner for long operations
  spinner: (text: string): Ora => ora(text).start(),
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let attempt = 1
  
  while (attempt <= maxAttempts) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1)
      logger.warning(`Attempt ${attempt} failed, retrying in ${formatDuration(delay)}...`)
      await sleep(delay)
      attempt++
    }
  }
  
  throw new Error('Max attempts reached')
}

/**
 * Safely parse JSON with fallback
 */
export function safeJsonParse<T = unknown>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

/**
 * Check if a value is defined and not null
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

/**
 * Validate semantic version format
 */
export function isValidSemver(version: string): boolean {
  // eslint-disable-next-line max-len
  const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
  return semverRegex.test(version)
}

/**
 * Sanitize a string for use as a branch name
 */
export function sanitizeBranchName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

/**
 * Pluralize a word based on count
 */
export function pluralize(word: string, count: number, suffix: string = 's'): string {
  return count === 1 ? word : word + suffix
}

/**
 * Truncate text to specified length
 */
export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - suffix.length) + suffix
}

/**
 * Create a time-based execution tracker
 */
export function createTimer() {
  const startTime = Date.now()
  
  return {
    elapsed: () => Date.now() - startTime,
    elapsedFormatted: () => formatDuration(Date.now() - startTime),
    lap: () => {
      const elapsed = Date.now() - startTime
      return { elapsed, formatted: formatDuration(elapsed) }
    },
  }
}

/**
 * Generate a simple hash from a string
 */
export function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16)
}

/**
 * Group array items by a key function
 */
export function groupBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K,
): Record<K, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item)
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(item)
    return groups
  }, {} as Record<K, T[]>)
}

/**
 * Remove duplicates from array
 */
export function unique<T>(array: T[]): T[] {
  return [...new Set(array)]
}

/**
 * Check if we're running in CI environment
 */
export function isCI(): boolean {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.TRAVIS ||
    process.env.CIRCLECI ||
    process.env.JENKINS_URL
  )
}

/**
 * Get the current working directory
 */
export function getCwd(): string {
  return process.cwd()
}

/**
 * Exit the process with proper cleanup
 */
export function exitProcess(code: number = 0, message?: string): never {
  if (message) {
    if (code === 0) {
      logger.success(message)
    } else {
      logger.error(message)
    }
  }
  process.exit(code)
}

/**
 * Handle process signals for graceful shutdown
 */
export function handleProcessSignals(cleanup?: () => Promise<void> | void): void {
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'] as const
  
  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.warning(`Received ${signal}, shutting down gracefully...`)
      
      if (cleanup) {
        try {
          await cleanup()
        } catch (error) {
          logger.error(`Error during cleanup: ${error}`)
        }
      }
      
      process.exit(0)
    })
  })
}

/**
 * UI utilities for better CLI experience
 */
export const ui = {
  /**
   * Create a styled box around content
   */
  box: (content: string, title?: string) => {
    const lines = content.split('\n')
    const maxLength = Math.max(
      ...lines.map(line => line.length),
      title ? title.length + 4 : 0
    )
    const width = Math.min(maxLength + 4, 80)
    
    console.log(chalk.cyan('┌' + '─'.repeat(width - 2) + '┐'))
    if (title) {
      const padding = Math.max(0, width - title.length - 4)
      const leftPad = Math.floor(padding / 2)
      const rightPad = padding - leftPad
      console.log(chalk.cyan('│') + ' '.repeat(leftPad) + chalk.bold(title) + ' '.repeat(rightPad + 1) + chalk.cyan('│'))
      console.log(chalk.cyan('├' + '─'.repeat(width - 2) + '┤'))
    }
    
    lines.forEach(line => {
      const padding = width - line.length - 3
      console.log(chalk.cyan('│') + ' ' + line + ' '.repeat(Math.max(0, padding)) + chalk.cyan('│'))
    })
    
    console.log(chalk.cyan('└' + '─'.repeat(width - 2) + '┘'))
  },

  /**
   * Create a progress indicator
   */
  progress: (current: number, total: number, label?: string) => {
    const percentage = Math.round((current / total) * 100)
    const filled = Math.round((current / total) * 20)
    const empty = 20 - filled
    const bar = '█'.repeat(filled) + '░'.repeat(empty)
    const display = `${chalk.cyan(bar)} ${percentage}%${label ? ` ${label}` : ''}`
    console.log(display)
  },

  /**
   * Create a summary table
   */
  table: (items: Array<{ label: string; value: string; status?: 'success' | 'warning' | 'error' }>) => {
    const maxLabelLength = Math.max(...items.map(item => item.label.length))
    
    items.forEach(item => {
      const padding = ' '.repeat(maxLabelLength - item.label.length + 2)
      const statusIcon = item.status === 'success' ? '✅' : 
                        item.status === 'warning' ? '⚠️' : 
                        item.status === 'error' ? '❌' : '•'
      
      console.log(`${statusIcon} ${chalk.bold(item.label)}${padding}${item.value}`)
    })
  },

  /**
   * Enhanced confirm prompt styling
   */
  confirmStyle: {
    pointer: chalk.cyan('❯'),
    prefix: chalk.cyan('?'),
    style: {
      answer: chalk.green,
      message: chalk.bold,
      default: chalk.dim,
      help: chalk.dim,
    },
  },

  /**
   * Enhanced select prompt styling  
   */
  selectStyle: {
    pointer: chalk.cyan('❯'),
    prefix: chalk.cyan('?'),
    separator: chalk.dim(' │ '),
    style: {
      answer: chalk.green,
      message: chalk.bold,
      choices: chalk.cyan,
      default: chalk.dim,
      help: chalk.dim,
    },
  },
}

/**
 * Create a confirm prompt that shows Y/N instead of true/false
 */
export function createConfirmPrompt(options: {
  name: string
  message: string
  initial?: boolean
}) {
  return {
    type: 'toggle',
    name: options.name,
    message: options.message,
    enabled: 'Y',
    disabled: 'N',
    initial: options.initial ?? true,
  }
}
