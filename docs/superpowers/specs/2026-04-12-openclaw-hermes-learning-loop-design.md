# OpenClaw Hermes 式自学习插件设计

## 1. 背景

用户希望为 OpenClaw 设计一个尽量接近 Hermes 自学习机制的插件，使 Agent（代理）具备以下能力：

- 任务结束后自动复盘
- 将可复用方法沉淀为 Skill（技能）
- 将用户偏好、稳定事实和工作方式沉淀为长期记忆
- 在后续会话中按需召回这些成长产物
- 支持长期演进、自动维护和审计追踪

本设计不引入外部 Hermes 进程，也不直接移植 Hermes runtime（运行时）。目标是在 OpenClaw 现有插件、context-engine（上下文引擎）、memory（记忆）和 skills（技能）体系内，构建一个 Hermes 风格的 learning loop（学习闭环）。

## 2. 已确认边界

本设计基于以下已确认决策：

- 形态：纯 OpenClaw 插件，不依赖 Hermes sidecar（旁路服务）
- 目标：尽量接近 Hermes 原版机制，而不是只补一层记忆
- 写入权限：允许全自动写入记忆与 Skill，仅保留审计日志
- 隔离方式：按 agent 隔离，不跨 agent 共享成长产物
- 触发方式：阈值触发，不做每轮强制复盘

## 3. 目标与非目标

### 3.1 目标

- 在主回复完成后，以后台方式执行复盘，不阻塞前台回复
- 将“事实型成长”和“方法型成长”分层存储
- 让自动生成的 Skill 具备候选、晋升、失效的生命周期
- 让成长结果能在后续运行中被按需检索和注入
- 保留完整审计链路，支持回溯每次自动学习的来源和结果

### 3.2 非目标

- 首版不做跨 agent 共享技能库
- 首版不依赖外部向量数据库、独立记忆服务或外部调度器
- 首版不做复杂 UI 审核流
- 首版不尝试完整复刻 Hermes 的全部内存模型与工具集
- 首版不改写 OpenClaw 核心 memory 插件的主职责

## 4. 总体方案

推荐实现为一个混合插件：

- 主体使用 `context-engine` 生命周期承接学习闭环
- 辅助使用少量 `hook` 补充运行时信号和兼容路径

核心闭环如下：

1. Agent 完成当前回合
2. 插件在 `afterTurn` 阶段计算复杂度分
3. 若达到阈值，则静默启动后台 review worker（复盘工作器）
4. review worker 输出结构化复盘结果
5. 插件将结果写入 agent 私有 learning store（学习存储）
6. 后续回合在 `assemble` 阶段按需召回相关成长产物

这条链路对应 Hermes 的核心精神：

- 前台执行与后台复盘解耦
- 复盘不仅写事实，还沉淀方法
- 成长结果进入下一轮运行，而不是只做离线归档

## 5. 插件分层架构

### 5.1 ReviewTrigger

职责：

- 在回合结束时统计复杂度
- 判断是否触发后台复盘
- 应用冷却机制，避免连续高复杂度回合频繁复盘

输入信号：

- 工具调用次数
- 工具种类数
- 失败后重试次数
- 执行改道次数
- 用户纠偏次数

输出：

- `shouldReview`
- `reasonCodes`
- `complexityScore`

### 5.2 ReviewWorker

职责：

- 在主回复完成后静默执行一次 review
- 基于当前回合消息和必要历史，生成结构化复盘结果
- 不向用户直接输出内容

建议实现：

- 优先使用 OpenClaw 的后台 subagent（子代理）或等价静默 agent run（代理运行）
- 复盘 prompt（提示词）只关注“是否值得沉淀”和“沉淀到哪里”，不复写前台回复

输出结构建议：

- `memoryCandidates`
- `skillCandidates`
- `userModelUpdates`
- `reuseConfidence`
- `dedupeHints`
- `summary`

### 5.3 LearningStore

职责：

- 保存自动成长相关的所有内部状态
- 提供索引、去重、状态流转和审计查询能力

特点：

- 完全按 agent 隔离
- 与用户手工维护的 `MEMORY.md`、workspace skills（工作区技能）分层
- 支持版本、状态和失效标记

### 5.4 GrowthWriter

职责：

- 将 review 结果写入具体存储
- 对 Skill 做去重、更新或新建
- 维护 candidate（候选）、promoted（已晋升）、stale（失效）状态

### 5.5 GrowthRecall

职责：

- 在后续回合按需召回成长结果
- 注入最近高价值成长摘要
- 暴露当前 agent 的自动学习 Skill 索引

## 6. 与 OpenClaw 的接入边界

### 6.1 主入口：context-engine

推荐使用 `context-engine` 的两个生命周期：

- `afterTurn`
  - 用于统计复杂度、触发 review、驱动学习闭环
- `assemble`
  - 用于按需召回成长结果，并向系统提示或上下文追加学习信息

原因：

- 该边界比普通工具插件更接近 runtime 核心
- 能天然承接“回合结束后学习、下轮运行前注入”的闭环
- 更接近 Hermes 的后台复盘设计

### 6.2 辅助入口：hooks

建议仅补充必要 hooks：

- `agent_end`
  - 补充成功/失败结果、耗时和会话级统计
- `before_prompt_build`
  - 在需要时注入轻量学习提示
- `before_model_resolve`
  - 预留将来基于成长结果微调模型选择的能力

首版不建议把学习逻辑分散到太多 hook 中，避免后期演化为补丁式架构。

## 7. 数据落盘设计

每个 agent workspace（代理工作区）下建立插件私有目录：

```text
.openclaw-hermes/
  reviews/
  skills/
  memory/
  learning-log.jsonl
  index.sqlite
```

### 7.1 reviews

保存每次复盘的结构化结果：

- 触发时间
- 触发原因
- 复杂度分
- 输入摘要
- 输出结论
- 写入动作
- 相关对象 ID

### 7.2 skills

保存自动生成的 agent 专属 Skill。

状态：

- `candidate`
- `promoted`
- `stale`
- `deprecated`

### 7.3 memory

保存插件管理的长期成长结果，例如：

- `durable.md`
- `user-model.md`
- `lessons.md`

首版建议由插件优先写入私有 memory，而不是直接改写用户的 `MEMORY.md`。

### 7.4 learning-log.jsonl

保存审计日志，至少包括：

- 时间
- 会话 ID
- review ID
- 触发条件
- 写入目标
- 写入结果
- 更新前后对象摘要

### 7.5 index.sqlite

保存轻量索引：

- Skill 元数据
- 记忆条目索引
- 去重指纹
- 最近命中时间
- 使用次数
- 生命周期状态

## 8. 与现有 OpenClaw 记忆体系的关系

OpenClaw 已具备以下能力：

- `MEMORY.md`
- `memory/YYYY-MM-DD.md`
- memory flush（预压缩记忆刷新）
- dreaming / REM / deep promotion（梦境整理与提升）

因此本插件不重做已有基础设施，而是补足“方法型成长”与“后台复盘闭环”。

建议关系如下：

- `MEMORY.md`
  - 继续主要承载人工长期记忆
- `memory/YYYY-MM-DD.md`
  - 可选写入插件生成的短期学习摘录，并标明来源
- `.openclaw-hermes/memory/*`
  - 作为自动成长主存储
- `.openclaw-hermes/skills/*`
  - 作为自动生成 Skill 的主存储

这样可以避免自动学习直接污染用户手工维护资产。

## 9. 复盘触发策略

### 9.1 基本原则

不直接照搬 Hermes 的固定 “10 次工具迭代” 规则，而是实现更适合 OpenClaw 的 complexity score（复杂度分）。

### 9.2 建议信号

- 工具调用次数
- 工具种类数
- 失败后重试次数
- 改道行为次数
- 用户纠偏次数

### 9.3 建议阈值

首版默认策略：

- 工具调用 `>= 6` 次：进入候选复盘区间
- 工具调用 `>= 10` 次：强制复盘
- 如出现明显失败重试或改道：降低触发阈值
- 同一 session（会话）设置 2 到 3 轮冷却

### 9.4 冷却机制

目的：

- 降低 token（令牌）额外开销
- 避免长任务被拆成多个连续高复杂度回合时重复复盘

冷却信息写入 `index.sqlite` 或会话级 runtime 状态。

## 10. Review 输出与写入决策

### 10.1 记忆类输出

用于沉淀：

- 用户偏好
- 稳定事实
- 工作习惯
- 对代理行为的长期要求

### 10.2 技能类输出

用于沉淀：

- 可重复执行的方法
- 有明确步骤的 workflow（工作流）
- 经历过试错后得到的更优路径

### 10.3 拒绝写入条件

以下情况不应自动沉淀：

- 明显一次性的临时操作
- 依赖当前上下文、无法泛化的方法
- 含敏感瞬时数据的内容
- 与已有 Skill 高度重复但未带来增量信息的内容

## 11. Skill 防污染设计

### 11.1 三道门机制

自动写入 Skill 前必须通过三道门：

1. 可复用性检查
2. 近重复检查
3. 生命周期状态约束

### 11.2 可复用性检查

review 必须显式判断：

- 该方法是否可抽象为稳定步骤
- 是否依赖临时环境
- 是否可在未来相似任务中重用

### 11.3 近重复检查

写入前对现有 Skill 执行相似度比较：

- 高相似：更新已有 Skill
- 中相似：合并或标记为变体
- 低相似：创建新 Skill

### 11.4 生命周期

建议状态机：

- `candidate`
  - 新生成，尚未证明稳定
- `promoted`
  - 多次命中且复用成功
- `stale`
  - 长期未使用或近期效果下降
- `deprecated`
  - 明确被替代，不再参与优先注入

### 11.5 晋升条件

首版可采用简化规则：

- 再次被命中并使用成功
- 后续 review 再次确认其有效性

## 12. 成长结果召回策略

### 12.1 召回原则

不是每轮全量注入，而是按需召回。

### 12.2 召回对象

- 与当前问题语义相关的 durable memory（长期记忆）
- 最近新学到且高置信度的 Skill
- 当前 agent 最近一次重要学习总结

### 12.3 注入方式

优先通过以下方式注入：

- `assemble` 的 `systemPromptAddition`
- memory prompt supplement（记忆提示补充）
- 技能索引列表

不建议把完整 Skill 正文长期常驻到每轮 prompt（提示词）中，应保持“索引常驻，正文按需加载”的思路。

## 13. 安全、审计与可控性

尽管本设计允许全自动写入，仍需保留以下控制能力：

- 所有自动学习动作写入 `learning-log.jsonl`
- 每条 Skill 和记忆具备来源 review ID
- 支持将对象标记为 `stale` 或 `deprecated`
- 支持未来补充禁写规则、路径隔离规则和对象回滚

首版不强制人工审批，但必须保留足够的审计信息，避免完全黑箱。

## 14. MVP 范围

首版只实现最小闭环：

- `afterTurn`
- 复杂度计分
- 阈值触发 review
- 结构化复盘结果
- 写入 agent 私有 memory 与 candidate skill
- 下一轮按需召回

首版暂不实现：

- 跨 agent 共享
- 外部记忆服务
- 复杂 UI 审核流
- 多阶段深度重排与高级用户建模

## 15. 实施顺序

推荐实现顺序：

1. `LearningStore`
2. `ReviewTrigger`
3. `ReviewWorker`
4. `GrowthWriter`
5. `GrowthRecall`
6. `Promotion/Deprecation`

## 16. 风险

主要风险如下：

- 自动学习污染：错误方法被过早固化
- 运行成本上升：后台 review 会增加模型调用成本
- 上下文膨胀：成长召回若过量，会与 OpenClaw 现有 bootstrap（启动上下文）和 memory 竞争预算
- 职责重叠：需避免与 memory flush、dreaming、已有 skills 系统重复写入

## 17. 结论

在“纯 OpenClaw 插件、自动落盘、按 agent 隔离、阈值触发”的约束下，最佳方案不是移植 Hermes，而是在 OpenClaw 内实现一个 Hermes 风格 learning loop 插件。

推荐采用：

- `context-engine` 作为主学习入口
- `afterTurn` 作为后台复盘触发点
- agent 私有 learning store 作为成长主存储
- 候选 Skill 与晋升机制控制自动污染
- `assemble` 阶段按需召回成长结果

该方案既贴近 Hermes 的核心机制，也最大程度复用 OpenClaw 已有的插件与记忆能力。
