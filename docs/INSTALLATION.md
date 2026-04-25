# Hermes Learning Plugin 安装与启用指南

## 一键安装（推荐）

```bash
npx -y github:wlli26/Hermes-Learning-Loop install
```

执行后重启 OpenClaw 即可生效。该命令会自动完成：

1. 把插件入口（`dist/src/index.js`）写入 `~/.openclaw/openclaw.json` 的 `plugins.load.paths`
2. 把 `plugins.slots.contextEngine` 设置为 `hermes-learning`
3. 在 `plugins.entries.hermes-learning.enabled` 中显式启用
4. 写入 `plugins.installs.index` 安装记录
5. 自动备份原配置文件（`openclaw.json.<timestamp>.bak`）

### 其他命令

```bash
npx -y github:wlli26/Hermes-Learning-Loop status     # 查看当前是否启用
npx -y github:wlli26/Hermes-Learning-Loop uninstall  # 移除插件，恢复原配置
```

---

## 手动安装（高级）

如果你需要完全控制安装过程，可以参照下面的步骤手动完成。

### 前置要求

- OpenClaw 版本 >= 2026.3.24-beta.2
- Node.js 环境
- 已完成插件编译（`npm run build`）

## 安装步骤

### 1. 编译插件

```bash
cd /path/to/openclaw-learning-loop
npm install
npm run build
```

编译后的入口文件位于 `dist/src/index.js`。

### 2. 安装插件到 OpenClaw

使用 OpenClaw CLI 安装插件：

```bash
openclaw plugins install --link --dangerously-force-unsafe-install \
  /path/to/openclaw-learning-loop/dist/src/index.js
```

**参数说明**：
- `--link`: 创建符号链接而非复制文件（开发模式推荐）
- `--dangerously-force-unsafe-install`: 跳过安全检查（仅用于本地开发）

安装后，插件路径会被添加到 `~/.openclaw/openclaw.json` 的 `plugins.load.paths` 中。

### 3. 启用插件（关键步骤）

**重要**：通过 `plugins.load.paths` 加载的 workspace 插件在 OpenClaw 中默认是 **禁用** 的，必须显式激活。

编辑 `~/.openclaw/openclaw.json`，在 `plugins` 节中添加以下配置之一：

#### 方案 A：设置为 Context Engine Slot（推荐）

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/path/to/openclaw-learning-loop/dist/src/index.js"
      ]
    },
    "slots": {
      "contextEngine": "hermes-learning"
    }
  }
}
```

#### 方案 B：在 entries 中显式启用

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/path/to/openclaw-learning-loop/dist/src/index.js"
      ]
    },
    "entries": {
      "hermes-learning": {
        "enabled": true
      }
    }
  }
}
```

#### 方案 C：添加到 allow 列表

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/path/to/openclaw-learning-loop/dist/src/index.js"
      ]
    },
    "allow": ["hermes-learning"]
  }
}
```

**推荐使用方案 A**，因为它语义上明确表示该插件是 Context Engine 类型。

### 4. 重启 OpenClaw

配置修改后需要重启 OpenClaw 才能生效：

```bash
# 如果 OpenClaw 正在运行，先停止
# 然后重新启动
openclaw
```

## 验证安装

### 检查插件是否加载

```bash
openclaw plugins list
```

应该能看到 `hermes-learning` 插件，状态为 `enabled`。

### 检查运行时行为

1. 启动一个对话会话
2. 执行一些操作，触发 6 次以上的工具调用（或包含重试、改道、用户纠正等信号）
3. 检查 agent workspace 目录：

```bash
ls ~/.openclaw/agents/main/.openclaw-hermes/
```

应该能看到以下目录结构：

```
.openclaw-hermes/
├── reviews/              # 评审记录
├── skills/               # 生成的技能
├── memory/
│   ├── durable.md        # 长期记忆
│   └── user-model.md     # 用户模型
├── learning-log.jsonl    # 审计日志
└── state.json            # 状态元数据
```

## 常见问题

### Q: 插件已安装但 `.openclaw-hermes/` 目录没有创建？

**A**: 检查以下几点：

1. **插件是否已启用**：确认 `openclaw.json` 中配置了 `slots.contextEngine` 或 `entries.hermes-learning.enabled: true`
2. **是否重启 OpenClaw**：配置修改后必须重启
3. **是否触发了评审条件**：默认需要 1+ 次工具调用才会触发评审（结合复杂度信号），可以在配置中调整阈值

### Q: 如何调整评审触发阈值？

**A**: 在 `openclaw.json` 中添加插件配置：

```json
{
  "plugins": {
    "entries": {
      "hermes-learning": {
        "enabled": true,
        "config": {
          "review": {
            "toolCallCandidateThreshold": 1,
            "toolCallForceThreshold": 2,
            "cooldownTurns": 2
          }
        }
      }
    }
  }
}
```

**默认值**：
- `toolCallCandidateThreshold: 1` - 工具调用达到 1 次时开始考虑评审（结合其他信号）
- `toolCallForceThreshold: 2` - 工具调用达到 2 次时强制触发评审
- `cooldownTurns: 2` - 两次评审之间至少间隔 2 个 turn

### Q: 如何查看插件日志？

**A**: 插件会通过 OpenClaw 的日志系统输出信息，查看方式：

```bash
# 查看 OpenClaw 日志
tail -f ~/.openclaw/logs/*.log

# 或在启动时启用详细日志
OPENCLAW_LOG_LEVEL=debug openclaw
```

关键日志标识：
- `Hermes learning initialized store for agent`
- `Hermes learning review triggered for session`
- `Hermes learning review completed for session`

### Q: 开发时如何快速重新加载插件？

**A**: 

1. 修改代码后重新编译：`npm run build`
2. 重启 OpenClaw（插件会自动重新加载）

如果使用了 `--link` 参数安装，无需重新安装插件。

## 配置参考

完整的插件配置示例：

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/path/to/openclaw-learning-loop/dist/src/index.js"
      ]
    },
    "slots": {
      "contextEngine": "hermes-learning"
    },
    "entries": {
      "hermes-learning": {
        "enabled": true,
        "config": {
          "review": {
            "toolCallCandidateThreshold": 1,
            "toolCallForceThreshold": 2,
            "cooldownTurns": 2,
            "retryWeight": 1,
            "rerouteWeight": 1,
            "userCorrectionWeight": 1
          },
          "store": {
            "rootDirName": ".openclaw-hermes",
            "skillsDirName": ".openclaw/skills"
          }
        }
      }
    }
  }
}
```

## 技术细节

### 插件激活机制

OpenClaw 对 workspace 来源的插件（通过 `plugins.load.paths` 加载）采用默认禁用策略，需要满足以下条件之一才会激活：

1. 在 `plugins.allow` 列表中
2. `plugins.entries.<id>.enabled === true`
3. 被选为 `plugins.slots.contextEngine` 或 `plugins.slots.memory`

这是 OpenClaw 的安全机制，防止未经审查的本地插件自动运行。

### 插件类型

Hermes Learning 是 `context-engine` 类型插件，它通过 `api.registerContextEngine()` 注册，在每个 agent turn 后运行，负责：

1. 评估 turn 的复杂度和学习价值
2. 触发静默评审 sub-agent
3. 提取记忆和技能候选
4. 持久化到文件系统
5. 在后续 turn 中注入相关记忆和技能

## 相关文档

- [架构说明](./ARCHITECTURE.md)
- [单词卡场景](./WORD_CARD_SCENARIO.md)
- [OpenClaw 插件开发文档](https://github.com/openclaw/openclaw/blob/main/docs/plugins.md)
