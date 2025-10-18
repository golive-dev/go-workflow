/**
 * Core types and interfaces for Go Corp Workflow system
 */

export type VersionBumpType = 'patch' | 'minor' | 'major'

export type ReleaseType = 'standard' | 'feature' | 'hotfix' | 'prerelease'

export type DeploymentTarget = 'cloudflare-workers' | 'vercel' | 'netlify' | 'heroku' | 'aws' | 'custom'

export interface WorkflowConfig {
  /** Project name */
  name?: string
  /** Repository URL */
  repository?: string
  /** Default branch name */
  defaultBranch?: string
  /** Deployment targets */
  deployments?: DeploymentConfig[]
  /** Changelog configuration */
  changelog?: ChangelogConfig
  /** GitHub integration settings */
  github?: GitHubConfig
  /** NPM publishing settings */
  npm?: NpmConfig
  /** Git configuration */
  git?: GitConfig
  /** Custom commands */
  commands?: CommandConfig
}

export interface DeploymentConfig {
  /** Deployment target type */
  target: DeploymentTarget
  /** Display name */
  name?: string
  /** Command to run */
  command: string
  /** Environment variables */
  env?: Record<string, string>
  /** Working directory */
  cwd?: string
  /** Run before deployment */
  preCommand?: string
  /** Run after deployment */
  postCommand?: string
  /** Confirmation required */
  confirmRequired?: boolean
}

export interface ChangelogConfig {
  /** Changelog file path */
  path?: string
  /** Include commit types */
  includeTypes?: string[]
  /** Exclude commit types */
  excludeTypes?: string[]
  /** Custom sections */
  sections?: ChangelogSection[]
}

export interface ChangelogSection {
  title: string
  types: string[]
}

export interface GitHubConfig {
  /** Auto-create releases */
  autoRelease?: boolean
  /** Release template */
  releaseTemplate?: string
  /** PR template */
  prTemplate?: string
  /** Auto-merge PRs */
  autoMerge?: boolean
  /** Default labels for PRs */
  labels?: string[]
}

export interface NpmConfig {
  /** Registry URL */
  registry?: string
  /** Access level */
  access?: 'public' | 'private'
  /** Tag for releases */
  tag?: string
  /** Auto-publish on release */
  autoPublish?: boolean
}

export interface GitConfig {
  /** Commit message template */
  commitTemplate?: string
  /** Tag prefix */
  tagPrefix?: string
  /** Push tags automatically */
  pushTags?: boolean
  /** Remote name */
  remote?: string
}

export interface CommandConfig {
  /** Pre-release commands */
  preRelease?: string[]
  /** Post-release commands */
  postRelease?: string[]
  /** Build command */
  build?: string
  /** Test command */
  test?: string
  /** Lint command */
  lint?: string
}

export interface ReleaseContext {
  /** Current version */
  currentVersion: string
  /** New version */
  newVersion: string
  /** Version bump type */
  versionType: VersionBumpType
  /** Release type */
  releaseType: ReleaseType
  /** Current branch */
  branch: string
  /** Changed files */
  changedFiles: string[]
  /** Commits since last release */
  commits: GitCommit[]
  /** Configuration */
  config: WorkflowConfig
}

export interface GitCommit {
  /** Commit hash */
  hash: string
  /** Commit message */
  message: string
  /** Author name */
  author: string
  /** Author email */
  email: string
  /** Commit date */
  date: Date
  /** Files changed */
  files?: string[]
}

export interface ChangeAnalysis {
  /** Recommended version bump */
  versionBump: VersionBumpType
  /** Type of changes detected */
  changeType: string
  /** List of changes */
  changesList: string[]
  /** Changed files */
  changedFiles: string[]
  /** Commits analyzed */
  commits: GitCommit[]
  /** Breaking changes detected */
  hasBreaking: boolean
  /** Features added */
  hasFeatures: boolean
  /** Bug fixes */
  hasFixes: boolean
}

export interface PRDetails {
  /** PR title */
  title: string
  /** PR body */
  body: string
  /** Branch name */
  branch: string
  /** Labels */
  labels: string[]
  /** Assignees */
  assignees: string[]
  /** Auto-merge enabled */
  autoMerge: boolean
}

export interface ReleaseDetails {
  /** Release title */
  title: string
  /** Release notes */
  body: string
  /** Version tag */
  tag: string
  /** Is prerelease */
  prerelease: boolean
  /** Generate release notes */
  generateNotes: boolean
}

export interface DeploymentResult {
  /** Deployment target */
  target: DeploymentTarget
  /** Success status */
  success: boolean
  /** Error message if failed */
  error?: string
  /** Deployment URL */
  url?: string
  /** Deployment time */
  duration?: number
  /** Output logs */
  logs?: string[]
}

export interface WorkflowResult {
  /** Success status */
  success: boolean
  /** Version information */
  version: {
    from: string
    to: string
    type: VersionBumpType
  }
  /** Actions performed */
  actions: WorkflowAction[]
  /** Deployments */
  deployments: DeploymentResult[]
  /** Errors encountered */
  errors: string[]
  /** Execution time */
  duration: number
}

export interface WorkflowAction {
  /** Action type */
  type: 'git' | 'github' | 'npm' | 'deploy' | 'changelog' | 'custom'
  /** Action name */
  name: string
  /** Success status */
  success: boolean
  /** Error message if failed */
  error?: string
  /** Duration */
  duration?: number
}

export interface PromptOptions {
  /** Message to display */
  message: string
  /** Default value */
  default?: string
  /** Validation function */
  validate?: (value: string) => boolean | string
  /** Transform function */
  transform?: (value: string) => string
}

export interface SelectOptions<T = string> {
  /** Message to display */
  message: string
  /** Available choices */
  choices: Array<{ title: string; value: T; description?: string }>
  /** Default value */
  default?: T
  /** Multiple selection */
  multiple?: boolean
}

export interface ConfirmOptions {
  /** Message to display */
  message: string
  /** Default value */
  default?: boolean
}