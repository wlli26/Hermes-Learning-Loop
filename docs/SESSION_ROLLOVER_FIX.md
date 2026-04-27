# Session 文件滚动机制修复

## 问题背景

在长时间运行的对话中，Review Worker 的 session 文件会持续累积所有历次 review 的完整输入输出，导致上下文溢出：

```
[context-overflow-precheck] estimatedPromptTokens=114048 
promptBudgetBeforeReserve=111616 overflowTokens=2432
```

## 根本原因

虽然代码中有"保留首条消息 + 最后 18 条消息"的限制（`src/context/hermes-learning-engine.ts:227-230`），但这个限制只作用于**传入 review prompt 的对话摘要**，而不是 review worker 自身的 session 历史。

Review worker 使用 `sessionFile` 参数持久化对话历史，每次被调用时会加载完整的 session 文件：

```typescript
const result = await api.runtime.agent.runEmbeddedPiAgent({
  sessionFile: reviewSessionFile,  // ← 持续累积
  ...
});
```

在 AI+教育场景的验证中，经过多轮纠错（页眉页脚、中文方块等问题），单个 session 文件累积到 **422KB**，转换为约 **114K tokens**，超出模型限制。

## 修复方案

采用 **Session 文件滚动**机制：

1. 每次创建 review session 前，检查文件大小
2. 如果超过 **100KB** 阈值，将旧文件归档
3. 创建新的 session 文件继续记录

### 代码变更

**文件**：`src/index.ts`

```typescript
// Session 文件滚动：超过 100KB 则归档旧文件
if (fs.existsSync(reviewSessionFile)) {
  const stats = fs.statSync(reviewSessionFile);
  const maxSizeBytes = 100 * 1024; // 100KB
  if (stats.size > maxSizeBytes) {
    const archivePath = `${reviewSessionFile}.archived-${Date.now()}`;
    fs.renameSync(reviewSessionFile, archivePath);
    // 新的 review 将创建新文件
  }
}
```

### 阈值选择

- **100KB** ≈ **25K tokens**（按 1 token ≈ 4 bytes 估算）
- 远低于模型的 128K 上下文限制
- 可以保留最近约 10-15 次 review 的历史
- 既避免了无限增长，又保留了短期上下文

## 风险评估

### ✅ 低风险

1. **去重能力不受影响**：Review worker 的去重判断依赖 `state.json` 中的 `existingMemories` 和 `existingSkills`，而非 session 历史
2. **调试能力保留**：归档文件仍然保留，可以追溯完整历史
3. **文件数量可控**：每个主 session 最多产生 N 个归档文件（N = 总对话轮数 / 10）

### ⚠️ 需要注意

1. **归档文件清理**：长期运行后，`review-sessions/` 目录下会累积归档文件，建议定期清理超过 30 天的归档
2. **磁盘空间**：每个归档文件约 100KB，100 个归档文件约 10MB，可接受

## 验证结果

测试脚本验证了滚动逻辑：

```
测试 1: 创建小文件（不触发滚动）
  文件大小: 51200 bytes
  ✅ 正确：未触发滚动

测试 2: 扩展文件到超过阈值（触发滚动）
  文件大小: 112640 bytes
  ✅ 正确：触发滚动，归档到 test-session.jsonl.archived-1777280352425
  ✅ 归档文件创建成功
  ✅ 原文件已删除

测试 3: 创建新文件（滚动后）
  ✅ 新文件创建成功，大小: 16 bytes
```

## 后续优化建议

1. **自动清理归档文件**：在插件初始化时，删除超过 30 天的 `.archived-*` 文件
2. **可配置阈值**：将 100KB 阈值作为配置项，允许用户根据模型限制调整
3. **监控告警**：当归档文件数量超过阈值时，记录警告日志

## 相关文件

- 修复代码：`src/index.ts:66-81`
- 对话摘要逻辑：`src/context/hermes-learning-engine.ts:218-234`
- 验证文档：`docs/VERIFICATION_AI_EDUCATION.md`

---

**修复日期**：2026-04-27  
**Commit**：`6253036` - fix: implement session file rollover to prevent context overflow
