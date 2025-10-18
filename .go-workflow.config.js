/**
 * Go Corp Workflow Configuration
 */

export default {
  name: "go-workflow",
  repository: "https://github.com/golive-dev/go-workflow.git",
  deployments: [
    {
      target: "cloudflare-workers",
      name: "Cloudflare Workers",
      command: "npm run deploy:workers"
    }
  ],
  npm: {
    access: "public",
    autoPublish: false
  },
  github: {
    autoRelease: true,
    autoMerge: false,
    labels: ["enhancement"]
  }
}