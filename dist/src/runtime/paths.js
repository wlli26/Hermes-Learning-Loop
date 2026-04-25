import path from "node:path";
export function resolveLearningPaths(params) {
    const rootDir = path.join(params.agentWorkspaceDir, params.rootDirName);
    const skillsDir = params.skillsDirName
        ? path.join(params.agentWorkspaceDir, params.skillsDirName)
        : path.join(rootDir, "skills");
    // 使用全局状态目录（如果提供），否则使用 agent 本地目录
    const stateDir = params.globalStateDir ?? rootDir;
    return {
        rootDir,
        reviewsDir: path.join(rootDir, "reviews"),
        skillsDir,
        memoryDir: path.join(stateDir, "memory"),
        auditLogFile: path.join(rootDir, "learning-log.jsonl"),
        stateFile: path.join(stateDir, "state.json"),
    };
}
