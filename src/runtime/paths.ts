import path from "node:path";

export type LearningPaths = {
  rootDir: string;
  reviewsDir: string;
  skillsDir: string;
  memoryDir: string;
  sqliteFile: string;
  auditLogFile: string;
};

export function resolveLearningPaths(params: {
  agentWorkspaceDir: string;
  rootDirName: string;
}): LearningPaths {
  const rootDir = path.join(params.agentWorkspaceDir, params.rootDirName);
  return {
    rootDir,
    reviewsDir: path.join(rootDir, "reviews"),
    skillsDir: path.join(rootDir, "skills"),
    memoryDir: path.join(rootDir, "memory"),
    sqliteFile: path.join(rootDir, "index.sqlite"),
    auditLogFile: path.join(rootDir, "learning-log.jsonl"),
  };
}
