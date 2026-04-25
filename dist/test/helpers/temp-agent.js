export function createTempAgentWorkspace(baseDir, agentId = "main") {
    return {
        agentId,
        workspaceDir: `${baseDir}/${agentId}`,
    };
}
