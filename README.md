# Hermes Learning Loop

让 OpenClaw agent 不只是记住历史，而是逐步形成经验。

## 一键安装

**GitHub（公网）：**

```bash
npx -y github:wlli26/Hermes-Learning-Loop install
```

**iFlytek GitLab（内网）：**

```bash
npx -y git+https://git.iflytek.com/hy_spark_agent_builder/workflow-skill/claw-learning-loop.git#develop install
```

随后重启 OpenClaw 即可生效。其它命令：

```bash
# GitHub
npx -y github:wlli26/Hermes-Learning-Loop status
npx -y github:wlli26/Hermes-Learning-Loop uninstall

# iFlytek GitLab
npx -y git+https://git.iflytek.com/hy_spark_agent_builder/workflow-skill/claw-learning-loop.git#develop status
npx -y git+https://git.iflytek.com/hy_spark_agent_builder/workflow-skill/claw-learning-loop.git#develop uninstall
```

详见 [docs/INSTALLATION.md](./docs/INSTALLATION.md)。

---


`OpenClaw Learning Loop` 是一个面向 OpenClaw 的学习闭环插件。它不追求把上下文越堆越长，而是希望让 agent 在每一次真实工作之后，都留下以后还能继续派上用场的东西。

它关注的不是“这次聊了什么”，而是“这次有没有学到值得以后继续使用的经验”。一次对话完成之后，系统会判断这轮交互是否值得复盘，把真正有长期价值的内容提炼为 memory 或 skill，并在后续任务里重新提供给 agent。

它希望带来的变化很直接：

- agent 不只是保留信息，还能逐步沉淀判断和方法
- 重复出现的任务不必每次重新摸索
- 有价值的经验会在后续工作中持续发挥作用

这不是一个为了“记更多”而存在的项目，而是一个为了“越用越稳、越做越熟”而设计的学习插件。

## 为什么存在

很多 agent memory 系统都能保存信息，但“保存”并不等于“学习”。常见的问题通常有几类：

- 所有内容都被追加保存，但缺少筛选，真正重要的信息很快被淹没
- 能留下事实，却留不下方法，agent 很难真正形成经验
- 存下来的内容和下一次工作脱节，结果是“记了很多，帮得很少”
- 上下文越来越长，但判断标准、检查清单和经验模式没有被稳定沉淀下来

`OpenClaw Learning Loop` 的出发点，就是把 agent 的 memory 从被动存储推进到主动学习。

它关心的不只是 agent 看过什么，还关心：

- 哪些回合值得复盘
- 哪些内容应该变成长期 memory
- 哪些模式已经足够稳定，可以沉淀为 skill
- 这些沉淀产物在之后的任务里，能否真正帮助 agent 做出更好的判断和执行

所以，这个项目更适合被理解为一个让 agent 逐渐形成经验的学习插件，而不是一个普通的记忆插件。

## 核心能力

- 回合级 review 触发  
  在对话完成后判断这一轮是否真的值得学习，把注意力和计算资源集中在更有价值的回合上，而不是对每次交互平均用力。

- memory 候选沉淀  
  将长期有效的事实、偏好、结论和背景信息沉淀下来，让 agent 在未来面对相似任务时不必从零开始。

- skill 候选沉淀  
  当一次交互体现出稳定的方法、检查清单、判断标准或工具使用模式时，将其提炼为可复用 skill，让经验不止停留在当下。

- 去重与状态管理  
  管理沉淀内容的状态与去重，避免知识库不断膨胀却越来越混乱。

- 按 agent 隔离的学习空间  
  为不同 agent 保持各自独立的学习空间，避免经验和上下文彼此污染。

- 面向后续对话的 recall  
  已沉淀的 memory 与 skill 会在后续对话中重新参与工作，让学习结果真正影响下一次执行，而不是停留在磁盘里。
