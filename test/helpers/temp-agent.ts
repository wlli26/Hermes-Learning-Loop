export function createTempAgentWorkspace(baseDir: string, agentId = "main") {
  return {
    agentId,
    workspaceDir: `${baseDir}/${agentId}`,
  };
}
