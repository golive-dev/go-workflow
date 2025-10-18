/**
 * NPM publishing for workflow automation
 */

import { execa } from 'execa'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NpmConfig } from '../types.js'
import { logger, retry } from '../utils/index.js'

export interface NpmPackageInfo {
  name: string
  version: string
  description?: string
  private?: boolean
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export interface PublishResult {
  success: boolean
  version: string
  registry: string
  tarball?: string
  error?: string
  duration: number
}

export class NpmPublisher {
  private config: NpmConfig
  private cwd: string

  constructor(config: NpmConfig = {}, cwd: string = process.cwd()) {
    this.config = {
      registry: 'https://registry.npmjs.org',
      access: 'public',
      tag: 'latest',
      autoPublish: false,
      ...config,
    }
    this.cwd = cwd
  }

  /**
   * Check if npm is installed and authenticated
   */
  async checkNpmStatus(): Promise<{ installed: boolean; authenticated: boolean; user?: string }> {
    try {
      await execa('npm', ['--version'], { cwd: this.cwd })
      
      try {
        const { stdout } = await execa('npm', ['whoami'], { cwd: this.cwd })
        return { installed: true, authenticated: true, user: stdout.trim() }
      } catch {
        return { installed: true, authenticated: false }
      }
    } catch {
      return { installed: false, authenticated: false }
    }
  }

  /**
   * Get package information from package.json
   */
  getPackageInfo(): NpmPackageInfo | null {
    const packagePath = join(this.cwd, 'package.json')
    
    if (!existsSync(packagePath)) {
      return null
    }

    try {
      const content = readFileSync(packagePath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  /**
   * Check if package is private
   */
  isPrivatePackage(): boolean {
    const packageInfo = this.getPackageInfo()
    return packageInfo?.private === true
  }

  /**
   * Get published version from registry
   */
  async getPublishedVersion(packageName?: string): Promise<string | null> {
    const packageInfo = this.getPackageInfo()
    const name = packageName || packageInfo?.name
    
    if (!name) {
      return null
    }

    try {
      const { stdout } = await execa('npm', ['view', name, 'version'], { 
        cwd: this.cwd,
        env: { ...process.env, npm_config_registry: this.config.registry },
      })
      return stdout.trim()
    } catch {
      return null
    }
  }

  /**
   * Check if version is already published
   */
  async isVersionPublished(version?: string): Promise<boolean> {
    const packageInfo = this.getPackageInfo()
    const checkVersion = version || packageInfo?.version
    
    if (!checkVersion) {
      return false
    }

    try {
      const { stdout } = await execa('npm', ['view', `${packageInfo?.name}@${checkVersion}`, 'version'], {
        cwd: this.cwd,
        env: { ...process.env, npm_config_registry: this.config.registry },
      })
      return stdout.trim() === checkVersion
    } catch {
      return false
    }
  }

  /**
   * Build package before publishing
   */
  async buildPackage(): Promise<void> {
    const packageInfo = this.getPackageInfo()
    
    // Check for build script
    if (packageInfo?.scripts?.build) {
      logger.info('Building package...')
      await execa('npm', ['run', 'build'], { cwd: this.cwd, stdio: 'inherit' })
    } else if (packageInfo?.scripts?.prepublishOnly) {
      logger.info('Running prepublishOnly script...')
      await execa('npm', ['run', 'prepublishOnly'], { cwd: this.cwd, stdio: 'inherit' })
    }
  }

  /**
   * Run package tests
   */
  async testPackage(): Promise<void> {
    const packageInfo = this.getPackageInfo()
    
    if (packageInfo?.scripts?.test && packageInfo.scripts.test !== 'echo "Error: no test specified" && exit 1') {
      logger.info('Running tests...')
      await execa('npm', ['test'], { cwd: this.cwd, stdio: 'inherit' })
    }
  }

  /**
   * Publish package to npm
   */
  async publishPackage(options: {
    tag?: string
    access?: 'public' | 'private'
    dryRun?: boolean
    skipBuild?: boolean
    skipTests?: boolean
  } = {}): Promise<PublishResult> {
    const startTime = Date.now()
    
    try {
      const packageInfo = this.getPackageInfo()
      if (!packageInfo) {
        throw new Error('package.json not found')
      }

      if (this.isPrivatePackage()) {
        throw new Error('Cannot publish private package')
      }

      // Check if already published
      const alreadyPublished = await this.isVersionPublished()
      if (alreadyPublished) {
        throw new Error(`Version ${packageInfo.version} is already published`)
      }

      // Build package
      if (!options.skipBuild) {
        await this.buildPackage()
      }

      // Run tests
      if (!options.skipTests) {
        await this.testPackage()
      }

      // Prepare publish command
      const args = ['publish']
      
      if (options.dryRun) {
        args.push('--dry-run')
      }
      
      if (options.tag || this.config.tag) {
        args.push('--tag', options.tag || this.config.tag!)
      }
      
      if (options.access || this.config.access) {
        args.push('--access', options.access || this.config.access!)
      }

      // Set registry if specified
      const env = { ...process.env }
      if (this.config.registry) {
        env.npm_config_registry = this.config.registry
      }

      // Execute publish
      logger.info(`Publishing ${packageInfo.name}@${packageInfo.version}...`)
      
      await retry(async () => {
        return await execa('npm', args, { 
          cwd: this.cwd, 
          stdio: 'inherit',
          env, 
        })
      }, 3)

      logger.success(`Successfully published ${packageInfo.name}@${packageInfo.version}`)

      return {
        success: true,
        version: packageInfo.version,
        registry: this.config.registry || 'https://registry.npmjs.org',
        duration: Date.now() - startTime,
      }

    } catch (error) {
      return {
        success: false,
        version: '',
        registry: this.config.registry || 'https://registry.npmjs.org',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * Create a package tarball
   */
  async createTarball(): Promise<string> {
    const { stdout } = await execa('npm', ['pack'], { cwd: this.cwd })
    const tarballName = stdout.trim()
    logger.success(`Created tarball: ${tarballName}`)
    return tarballName
  }

  /**
   * Get package download stats
   */
  async getDownloadStats(period: 'last-day' | 'last-week' | 'last-month' = 'last-month'): Promise<{ downloads: number; period: string } | null> {
    const packageInfo = this.getPackageInfo()
    if (!packageInfo?.name) {
      return null
    }

    try {
      const { stdout } = await execa('npm', ['view', packageInfo.name, '--json'], { cwd: this.cwd })
      JSON.parse(stdout)
      
      // This is a simplified version - real npm stats would require the npm-stat API
      return {
        downloads: 0,
        period,
      }
    } catch {
      return null
    }
  }

  /**
   * Deprecate a package version
   */
  async deprecateVersion(version: string, message: string): Promise<void> {
    const packageInfo = this.getPackageInfo()
    if (!packageInfo?.name) {
      throw new Error('Package name not found')
    }

    await execa('npm', ['deprecate', `${packageInfo.name}@${version}`, message], {
      cwd: this.cwd,
      env: { ...process.env, npm_config_registry: this.config.registry },
    })

    logger.success(`Deprecated ${packageInfo.name}@${version}: ${message}`)
  }

  /**
   * Update package version
   */
  async updateVersion(versionType: 'patch' | 'minor' | 'major' | string): Promise<string> {
    const { stdout } = await execa('npm', ['version', versionType, '--no-git-tag-version'], {
      cwd: this.cwd,
    })
    
    const newVersion = stdout.trim().replace(/^v/, '')
    logger.success(`Updated version to ${newVersion}`)
    return newVersion
  }
}

/**
 * Create a new NpmPublisher instance
 */
export function createNpmPublisher(config?: NpmConfig, cwd?: string): NpmPublisher {
  return new NpmPublisher(config, cwd)
}

/**
 * Quick publish function
 */
export async function publishPackage(
  options: Parameters<NpmPublisher['publishPackage']>[0] = {},
  config?: NpmConfig,
  cwd?: string,
): Promise<PublishResult> {
  const publisher = createNpmPublisher(config, cwd)
  return await publisher.publishPackage(options)
}