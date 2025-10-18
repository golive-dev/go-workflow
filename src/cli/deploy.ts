/**
 * Deploy command implementation
 */

import { prompt } from 'enquirer'
import { loadWorkflowConfig } from '../config/index.js'
import { createDeploymentManager } from '../deploy/index.js'
import { createGitOperations } from '../git/index.js'
import { createTimer, exitProcess, logger, ui } from '../utils/index.js'
import type { DeploymentConfig } from '../types.js'

export interface DeployOptions {
  target?: string
  all?: boolean
  confirm?: boolean
}

export async function runDeploy(options: DeployOptions): Promise<void> {
  const timer = createTimer()
  
  try {
    logger.section('🚀 Deployment Workflow')
    
    // Load configuration
    const config = await loadWorkflowConfig()
    const git = createGitOperations()
    const deploymentManager = createDeploymentManager()
    
    // Check if we have deployments configured
    if (!config.deployments || config.deployments.length === 0) {
      logger.error('No deployments configured')
      logger.info('💡 Add deployments to your .go-workflow.config.js file')
      logger.info('💡 Or run "go-workflow init" to set up configuration')
      exitProcess(1)
    }
    
    // Show current status
    const isGitRepo = await git.isGitRepository()
    if (isGitRepo) {
      const currentBranch = await git.getCurrentBranch()
      const currentVersion = git.getCurrentVersion()
      const hasUncommitted = await git.hasUncommittedChanges()
      
      logger.info(`📂 Branch: ${currentBranch}`)
      logger.info(`🏷️  Version: ${currentVersion}`)
      if (hasUncommitted) {
        logger.warning('⚠️  You have uncommitted changes')
      }
    }
    
    // Determine which deployments to run
    let deploymentsToRun: DeploymentConfig[] = []
    
    if (options.all) {
      deploymentsToRun = config.deployments
      logger.info(`\n🎯 Deploying to all ${config.deployments.length} targets`)
    } else if (options.target) {
      const targetDeployment = config.deployments.find(
        d => d.target === options.target || d.name === options.target,
      )
      
      if (!targetDeployment) {
        logger.error(`Deployment target "${options.target}" not found`)
        logger.info('\n📋 Available targets:')
        config.deployments.forEach(d => {
          logger.info(`   • ${d.target}${d.name ? ` (${d.name})` : ''}`)
        })
        exitProcess(1)
      }
      
      deploymentsToRun = [targetDeployment]
      logger.info(`\n🎯 Deploying to: ${targetDeployment.name || targetDeployment.target}`)
    } else {
      // Interactive target selection
      if (config.deployments.length === 1) {
        deploymentsToRun = config.deployments
        const deployment = config.deployments[0]!
        logger.info(`\n🎯 Deploying to: ${deployment.name || deployment.target}`)
      } else {
        logger.info('\n📋 Available deployment targets:')
        config.deployments.forEach((deployment, index) => {
          logger.info(`   ${index + 1}. ${deployment.name || deployment.target}`)
        })
        
        const choices = [
          ...config.deployments.map((deployment, index) => ({
            name: `single-${index}`,
            message: `${deployment.name || deployment.target}`,
            value: [deployment],
          })),
          {
            name: 'all',
            message: `All targets (${config.deployments.length} total)`,
            value: config.deployments,
          },
        ]
        
        const targetChoice = await prompt<{ targets: DeploymentConfig[] }>({
          type: 'select',
          name: 'targets',
          message: '🎯 Select deployment target(s):',
          choices,
          styles: ui.selectStyle,
        })
        
        deploymentsToRun = (targetChoice as any).targets
      }
    }
    
    // Show deployment summary
    logger.info('\n📋 Deployment Summary:')
    deploymentsToRun.forEach(deployment => {
      logger.info(`   • ${deployment.name || deployment.target}: ${deployment.command}`)
      if (deployment.confirmRequired) {
        logger.info('     ⚠️  Requires confirmation')
      }
    })
    
    // Confirmation check
    if (options.confirm !== false) {
      const needsConfirmation = deploymentsToRun.some(d => d.confirmRequired)
      
      if (needsConfirmation || deploymentsToRun.length > 1) {
        const confirmChoice = await prompt<{ proceed: boolean }>({
          type: 'confirm',
          name: 'proceed',
          message: `✨ Proceed with deployment to ${deploymentsToRun.length} target(s)?`,
          initial: true,
          format: (value: boolean) => value ? 'Y' : 'N',
          styles: ui.confirmStyle,
        })
        
        if (!(confirmChoice as any).proceed) {
          logger.warning('Deployment cancelled')
          exitProcess(0)
        }
      }
    }
    
    // Execute deployments
    logger.step('\n🚀 Starting deployments...')
    
    let deploymentMethod: 'sequential' | 'parallel' = 'sequential'
    
    // Ask about parallel deployment for multiple targets
    if (deploymentsToRun.length > 1 && options.confirm !== false) {
      const parallelChoice = await prompt<{ parallel: boolean }>({
        type: 'confirm',
        name: 'parallel',
        message: '⚡ Deploy to all targets in parallel? (faster but harder to debug)',
        initial: false,
        format: (value: boolean) => value ? 'Y' : 'N',
        styles: ui.confirmStyle,
      })
      
      if ((parallelChoice as any).parallel) {
        deploymentMethod = 'parallel'
      }
    }
    
    // Run deployments
    const results = deploymentMethod === 'parallel' 
      ? await deploymentManager.deployToTargetsParallel(deploymentsToRun)
      : await deploymentManager.deployToTargets(deploymentsToRun)
    
    // Show results
    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)
    
    // Results already handled above with new UI
    
    if (successful.length > 0 || failed.length > 0) {
      console.log()
      logger.section('Deployment Results')
      
      const allResults = [...successful, ...failed]
      ui.table(
        allResults.map(result => ({
          label: result.target,
          value: result.success 
            ? `${result.duration ? Math.round(result.duration / 1000) + 's' : 'completed'}${result.url ? ` → ${result.url}` : ''}`
            : result.error || 'failed',
          status: result.success ? 'success' : 'error'
        }))
      )
      
      // Show detailed error logs for failed deployments
      failed.forEach(result => {
        if (result.logs && result.logs.length > 0) {
          console.log()
          logger.warning(`Error logs for ${result.target}:`)
          result.logs.slice(-3).forEach(log => {
            logger.bullet(log.trim(), 1)
          })
        }
      })
      
      logger.sectionEnd()
    }
    
    // Overall summary
    const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0)
    const avgDuration = totalDuration / results.length
    
    logger.info('\n📊 Summary:')
    logger.info(`   • Total targets: ${results.length}`)
    logger.info(`   • Successful: ${successful.length}`)
    logger.info(`   • Failed: ${failed.length}`)
    logger.info(`   • Total time: ${timer.elapsedFormatted()}`)
    if (deploymentMethod === 'parallel' && results.length > 1) {
      logger.info(`   • Average deployment time: ${Math.round(avgDuration / 1000)}s`)
    }
    
    // Show next steps
    if (successful.length > 0) {
      logger.info('\n📋 Next steps:')
      logger.info('   • Verify deployments are working correctly')
      
      const urlsToCheck = successful.filter(r => r.url).map(r => r.url)
      if (urlsToCheck.length > 0) {
        logger.info('   • Check deployed applications:')
        urlsToCheck.forEach(url => {
          logger.info(`     - ${url}`)
        })
      }
      
      logger.info('   • Monitor for any issues')
      logger.info('   • Notify your team about the deployment')
    }
    
    if (failed.length > 0) {
      logger.info('\n🔧 Troubleshooting:')
      logger.info('   • Check the error messages above')
      logger.info('   • Verify your deployment configuration')
      logger.info('   • Check authentication and permissions')
      logger.info('   • Run individual deployments with more verbose output')
      
      // Show retry command
      const failedTargets = failed.map(r => r.target)
      if (failedTargets.length === 1) {
        logger.info(`   • Retry with: go-workflow deploy --target ${failedTargets[0]}`)
      }
    }
    
    // Exit with appropriate code
    if (failed.length > 0) {
      exitProcess(1, `Deployment completed with ${failed.length} failure(s)`)
    } else {
      logger.success(`\n🎉 All deployments completed successfully in ${timer.elapsedFormatted()}!`)
    }
    
  } catch (error) {
    logger.error(`❌ Deployment failed: ${error}`)
    exitProcess(1)
  }
}