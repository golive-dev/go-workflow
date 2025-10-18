/**
 * Deployment management for workflow automation
 */

import { execa } from 'execa'
import type { DeploymentConfig, DeploymentResult, DeploymentTarget } from '../types.js'
import { createTimer, logger, retry } from '../utils/index.js'

export class DeploymentManager {
  private cwd: string

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd
  }

  /**
   * Deploy to a single target
   */
  async deployToTarget(deployment: DeploymentConfig): Promise<DeploymentResult> {
    const timer = createTimer()
    const logs: string[] = []

    try {
      logger.step(`Deploying to ${deployment.name || deployment.target}...`)

      // Run pre-command if specified
      if (deployment.preCommand) {
        logger.info(`Running pre-command: ${deployment.preCommand}`)
        await this.runCommand(deployment.preCommand, deployment, logs)
      }

      // Run main deployment command
      logger.info(`Running: ${deployment.command}`)
      await this.runCommand(deployment.command, deployment, logs)

      // Run post-command if specified
      if (deployment.postCommand) {
        logger.info(`Running post-command: ${deployment.postCommand}`)
        await this.runCommand(deployment.postCommand, deployment, logs)
      }

      // Extract URL from logs if possible
      const url = this.extractDeploymentUrl(logs, deployment.target)

      logger.success(`Successfully deployed to ${deployment.name || deployment.target}`)

      return {
        target: deployment.target,
        success: true,
        ...(url && { url }),
        duration: timer.elapsed(),
        logs,
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`Failed to deploy to ${deployment.name || deployment.target}: ${errorMessage}`)

      return {
        target: deployment.target,
        success: false,
        error: errorMessage,
        duration: timer.elapsed(),
        logs,
      }
    }
  }

  /**
   * Deploy to multiple targets
   */
  async deployToTargets(deployments: DeploymentConfig[]): Promise<DeploymentResult[]> {
    const results: DeploymentResult[] = []

    for (const deployment of deployments) {
      const result = await this.deployToTarget(deployment)
      results.push(result)

      // Stop on first failure if not configured to continue
      if (!result.success) {
        logger.warning(`Deployment to ${deployment.target} failed, stopping deployment process`)
        break
      }
    }

    return results
  }

  /**
   * Deploy to targets in parallel
   */
  async deployToTargetsParallel(deployments: DeploymentConfig[]): Promise<DeploymentResult[]> {
    logger.info(`Deploying to ${deployments.length} targets in parallel...`)
    
    const promises = deployments.map(deployment => this.deployToTarget(deployment))
    const results = await Promise.allSettled(promises)

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value
      } else {
        return {
          target: deployments[index]!.target,
          success: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          duration: 0,
          logs: [],
        }
      }
    })
  }

  /**
   * Run a command with proper environment and error handling
   */
  private async runCommand(command: string, deployment: DeploymentConfig, logs: string[]): Promise<void> {
    const env = {
      ...process.env,
      ...deployment.env,
    }

    const cwd = deployment.cwd || this.cwd

    // Parse command into parts
    const [cmd, ...args] = command.split(' ')

    await retry(async () => {
      const { stdout, stderr } = await execa(cmd!, args, {
        cwd,
        env,
        stdio: 'pipe',
      })

      if (stdout) {
        logs.push(stdout)
      }
      if (stderr) {
        logs.push(stderr)
      }
    }, 3)
  }

  /**
   * Extract deployment URL from command output
   */
  private extractDeploymentUrl(logs: string[], target: DeploymentTarget): string | undefined {
    const logText = logs.join('\n')

    const patterns: Record<DeploymentTarget, RegExp[]> = {
      'cloudflare-workers': [
        /https:\/\/[\w-]+\.[\w-]+\.workers\.dev/,
        /Published to (https:\/\/[^\s]+)/,
      ],
      'vercel': [
        /https:\/\/[^\s]+\.vercel\.app/,
        /Preview: (https:\/\/[^\s]+)/,
        /Production: (https:\/\/[^\s]+)/,
      ],
      'netlify': [
        /https:\/\/[^\s]+\.netlify\.app/,
        /Website URL: (https:\/\/[^\s]+)/,
        /Live URL: (https:\/\/[^\s]+)/,
      ],
      'heroku': [
        /https:\/\/[^\s]+\.herokuapp\.com/,
        /deployed to (https:\/\/[^\s]+)/,
      ],
      'aws': [
        /https:\/\/[^\s]+\.amazonaws\.com/,
        /CloudFront URL: (https:\/\/[^\s]+)/,
      ],
      'custom': [
        /https?:\/\/[^\s]+/,
      ],
    }

    const targetPatterns = patterns[target] || patterns.custom

    for (const pattern of targetPatterns) {
      const match = logText.match(pattern)
      if (match) {
        return match[1] || match[0]
      }
    }

    return undefined
  }

  /**
   * Get deployment status for a target
   */
  async getDeploymentStatus(deployment: DeploymentConfig): Promise<{
    available: boolean
    version?: string
    lastDeployed?: Date
  }> {
    // This is a simplified version - real implementations would check actual deployment status
    try {
      const statusCommand = this.getStatusCommand(deployment.target)
      if (!statusCommand) {
        return { available: false }
      }

      const [cmd, ...args] = statusCommand.split(' ')
      const { stdout } = await execa(cmd!, args, {
        cwd: deployment.cwd || this.cwd,
        env: {
          ...process.env,
          ...deployment.env,
        },
      })

      const version = this.extractVersion(stdout)
      return {
        available: true,
        ...(version && { version }),
        lastDeployed: new Date(), // Simplified
      }

    } catch {
      return { available: false }
    }
  }

  /**
   * Get status command for different deployment targets
   */
  private getStatusCommand(target: DeploymentTarget): string | null {
    const commands: Record<DeploymentTarget, string | null> = {
      'cloudflare-workers': 'wrangler deployments list',
      'vercel': 'vercel ls',
      'netlify': 'netlify status',
      'heroku': 'heroku releases -n 1',
      'aws': null, // Depends on service
      'custom': null,
    }

    return commands[target]
  }

  /**
   * Extract version from status output
   */
  private extractVersion(output: string): string | undefined {
    // Look for common version patterns
    const versionPatterns = [
      /version[:\s]+([^\s\n]+)/i,
      /v?(\d+\.\d+\.\d+)/,
      /release[:\s]+([^\s\n]+)/i,
    ]

    for (const pattern of versionPatterns) {
      const match = output.match(pattern)
      if (match) {
        return match[1]
      }
    }

    return undefined
  }

  /**
   * Rollback deployment
   */
  async rollbackDeployment(deployment: DeploymentConfig, version?: string): Promise<DeploymentResult> {
    const timer = createTimer()
    const logs: string[] = []

    try {
      const rollbackCommand = this.getRollbackCommand(deployment.target, version)
      if (!rollbackCommand) {
        throw new Error(`Rollback not supported for ${deployment.target}`)
      }

      logger.step(`Rolling back ${deployment.name || deployment.target}...`)
      await this.runCommand(rollbackCommand, deployment, logs)

      logger.success(`Successfully rolled back ${deployment.name || deployment.target}`)

      return {
        target: deployment.target,
        success: true,
        duration: timer.elapsed(),
        logs,
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`Failed to rollback ${deployment.name || deployment.target}: ${errorMessage}`)

      return {
        target: deployment.target,
        success: false,
        error: errorMessage,
        duration: timer.elapsed(),
        logs,
      }
    }
  }

  /**
   * Get rollback command for different deployment targets
   */
  private getRollbackCommand(target: DeploymentTarget, version?: string): string | null {
    const commands: Record<DeploymentTarget, (version?: string) => string | null> = {
      'cloudflare-workers': () => null, // Cloudflare doesn't have direct rollback
      'vercel': (v) => v ? `vercel rollback ${v}` : 'vercel rollback',
      'netlify': (v) => v ? `netlify deploy --alias ${v}` : null,
      'heroku': (v) => v ? `heroku rollback ${v}` : 'heroku rollback',
      'aws': () => null, // Depends on service
      'custom': () => null,
    }

    return commands[target](version)
  }
}

/**
 * Create a new DeploymentManager instance
 */
export function createDeploymentManager(cwd?: string): DeploymentManager {
  return new DeploymentManager(cwd)
}

/**
 * Quick deploy function
 */
export async function deployToTarget(
  deployment: DeploymentConfig,
  cwd?: string,
): Promise<DeploymentResult> {
  const manager = createDeploymentManager(cwd)
  return await manager.deployToTarget(deployment)
}

/**
 * Deploy to multiple targets
 */
export async function deployToMultipleTargets(
  deployments: DeploymentConfig[],
  parallel: boolean = false,
  cwd?: string,
): Promise<DeploymentResult[]> {
  const manager = createDeploymentManager(cwd)
  
  if (parallel) {
    return await manager.deployToTargetsParallel(deployments)
  } else {
    return await manager.deployToTargets(deployments)
  }
}