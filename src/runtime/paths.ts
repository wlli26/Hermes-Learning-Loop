import path from "node:path";

export type LearningPaths = {
  rootDir: string;
  reviewsDir: string;
  skillsDir: string;
  memoryDir: string;
  auditLogFile: string;
  stateFile: string;
};

export function resolveLearningPaths(params: {
  agentWorkspaceDir: string;
  rootDirName: string;
  skillsDirName?: string;
  globalStateDir?: string;
}): LearningPaths {
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
