export const WORKSPACE_DEPLOYMENT_ID=typeof __APP_DEPLOYMENT_ID__==='string'?__APP_DEPLOYMENT_ID__:'local'
export const workspaceDeploymentHeaders=()=>({'x-workspace-deployment':WORKSPACE_DEPLOYMENT_ID})
