# Termless 产品笔记

> 最后更新：2026-09-18。标注说明：✅ 已确认；💡 提议，待确认；❓ 未决。

## 1. 一句话定位

**给完全不懂命令行的人用的 Mac 客户端：教程、GitHub 项目或 AI 让你「打开终端输入……」的时候，交给它，它用人话告诉你要做什么，然后安全地帮你做完。**

- ✅ 开源项目，目标是**拥有一群真实用户**（不只是开发者自用或作品集）。
- ✅ 不自建模型服务，借用用户本机的 CLI Agent 完成实际工作。

## 2. 目标用户

✅ **面向全球的 macOS 用户中，完全不懂命令行的人**：设计师、运营、学生、内容创作者……不知道 brew 是什么，也不想知道，只想把事办成。不为任何单一地区（包括中国大陆）单独设计，但也不排斥任何地区的用户。

他们的特征：
- 会用 ChatGPT / Claude 这类聊天产品，可能有订阅
- 看得懂教程，但一看到黑底白字的终端就慌
- 不会判断一条命令是否危险，也不会处理报错

**不是**第一版的目标用户：开发者（包括刚入门的）。他们能用，但不为他们做取舍。

## 3. 需求从哪来

✅ 普通人本来不会想着去「装 Python」，这些需求都是被外部推过来的：

| 来源 | 典型情况 |
|---|---|
| 教程让他运行命令 | YouTube / Reddit / 小红书 / B 站 / 博客：「打开终端，输入 `brew install ...`」 |
| 想跑 GitHub 上的项目 | 看到一个好玩的开源工具，README 里全是命令 |
| 想用 AI 相关工具 | 本地模型、ComfyUI、MCP 服务、各种 CLI Agent |
| 自己想做某件事 | 下视频、转格式、压图片 —— 需要 App 推荐该装什么 |

因此产品的核心输入不只是一句话，还包括：**一条命令、一个 GitHub 链接、一段教程文字**。

## 4. 核心场景

✅ 第一版聚焦：**装东西、配环境**。以下五个场景均已确认。

1. **粘贴命令**：用户把教程里的命令粘进来 → App 解释「这条命令会做什么、是否安全」→ 用户点确认 → 执行、处理报错 → 告诉用户装好了、怎么用。
2. **给一个 GitHub 链接**：App 读 README，判断需要什么环境 → 列出步骤卡片 → 一步步帮用户装好并跑起来。
3. **说一个目标**：「我想把这个 YouTube 视频下载下来」→ App 推荐工具（如 yt-dlp）→ 安装 → 顺便完成这次任务。
4. **看看电脑里装了什么**：打开「已安装」，看到每个工具是什么、占多少空间，可以更新、卸载。
5. **出问题了**：「昨天装的东西好像把什么搞坏了」→ 在「历史」里查看做过什么，一键撤销。

## 5. 产品原则

✅ 以下原则用来指导所有设计取舍：

1. **说人话**：默认不展示命令，只展示「要做什么、为什么」；命令折叠在「查看详情」里。
2. **先说清楚再动手**：任何会改变电脑的操作都先确认；危险等级用颜色区分（只读 / 安装 / 删除 / 需要管理员密码）。
3. **能撤销**：每一次改动都有记录，尽量提供撤销方式。
4. **报错不甩给用户**：失败时由 Agent 自己排查重试，只在需要用户决定时才问。
5. **网络问题说清楚**：默认用户有正常的国际网络，不内置镜像源；检测到网络异常（连不上 GitHub / Homebrew / 模型服务等）时，要用人话告诉用户是哪里不通、为什么，而不是抛出一段报错。如果用户需要，Agent 可以按用户的要求帮他配置代理或镜像。
6. **记得用户**：跨会话记住装过什么、用户的偏好，不让用户重复说明。

## 6. 信息架构

✅ 整体是一个客户端，功能分 Tab：

| Tab | 做什么 |
|---|---|
| **助手** | 对话界面。可以打字、粘贴命令 / 链接 / 教程，或者点澄清卡片回复；授权请求、提问都以卡片的形式出现 |
| **已安装** | 本机工具清单：一句人话说明用途、版本、占用空间；可以更新、卸载、「用它做点什么」（跳转到助手） |
| **发现** | 第一版只放 Coming soon 占位。未来：精选的常用工具和「配方」（如「视频下载套装」「本地 AI 画图环境」），一键安装 |
| **历史** | 所有操作记录：做了什么、为什么、结果如何；可以撤销；也是长期记忆的来源 |

✅ 另有**首次启动引导**（不是 Tab）：检测环境 → 选择并安装 / 登录一个 Agent → 装好 Homebrew 等基础工具。它本身就是产品能力的第一次演示。

## 7. 不做什么

✅ 第一版明确不做：
- 不做终端模拟器，不提供原始 shell 输入框，即输入内容被直接当作命令执行、不经过 AI 解释和确认的那种（助手的**对话输入框**照常保留；执行过的命令可以查看、复制）。理由：一旦有这种输入框，产品就会滑向「给开发者的终端」；想执行某条命令的用户，把命令粘贴进助手即可，同样会得到解释和确认
- 不为开发者的工作流优化（写代码、git 等）
- 不自建模型服务
- 不做 Windows / Linux
- 不做自己的软件源；「发现」只是精选推荐，实际安装仍然走 brew / npm / pipx 等
- 不修改系统安全设置（如关闭 SIP、改防火墙）
- 不为某个地区的网络单独做一套适配（如内置国内镜像源）

## 8. 怎么算做成了

✅
- 一个完全不懂命令行的人，**从下载 App 到用它装好第一个工具，全程不打开终端，10 分钟内完成**
- 能完成一篇典型教程（YouTube / 博客）里的全部命令步骤
- 有一批非开发者用户持续使用（具体数字待定）

## 9. 参考项目

都面向开发者，还没有真正面向普通用户的：

| 项目 | 地址 | 可借鉴的地方 |
|---|---|---|
| Wave Terminal | https://github.com/wavetermdev/waveterm | 终端内文件预览、分块布局，把输出做成界面 |
| goose | https://github.com/aaif-goose/goose | 开源 Agent 的桌面端交互；已转给 Agentic AI Foundation |
| Warp | https://github.com/warpdotdev/warp | 已开源（AGPL-3.0），终端里的 AI 交互细节 |
| Open Interpreter | https://github.com/openinterpreter/openinterpreter | 已转型为面向开源模型的命令行编程 Agent |

## 10. 技术方案

### 10.1 平台
- ✅ 第一版只做 **macOS**。
- ✅ 技术栈：**Electron + TypeScript**。理由：ACP、Codex SDK 都有官方 TypeScript 实现，对接 Agent 最顺；开源贡献门槛低；以后做 Windows 有退路。

### 10.2 Agent 层
- 💡 第一版**只支持 Codex CLI**（ChatGPT 账号登录），待确认。内部保留统一的 Agent 适配层，以后条款允许时再接入其他 Agent。
- ✅ **不支持 Claude Code**：条款不允许第三方产品以常规方式驱动 Claude 订阅（见 10.2.1）。
- ❌ **Gemini CLI**：个人账号（免费 / Pro / Ultra）已于 2026-06-18 停止服务，由闭源的 Antigravity CLI 取代（见 10.2.1）。
- ⚠️ **Antigravity CLI**：条款禁止用第三方软件访问 Antigravity，且没有官方 ACP，暂不支持（见 10.2.1）。
- 协议层：Codex 可用 ACP 适配器，或 `codex exec --json` / `codex app-server`。
- 不解析 TUI 屏幕输出，只用结构化事件（工具调用、输出、授权请求、提问）。
- ✅ **只通过 CLI 调用**，不打开也不依赖它们的桌面客户端。
- 登录一律走各 CLI 自己的官方流程（浏览器登录），App **永不接触 token**。
- ✅ 用户没有可用的 AI 账号：直接告知无法使用并说明原因（本产品依赖 AI）。
- ⚠️ CLI 自身会在 `~/.codex` 保存会话记录，可能出现在官方工具的历史里。需验证能否关闭持久化，或至少固定使用专用工作目录。

#### 10.2.1 订阅条款调研（2026-09-18）

**Anthropic（Claude Code）→ 放弃**，依据 [Claude Code · Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)：
- 禁止第三方 App 提供 Claude.ai 登录、接触 OAuth token、用 Agent SDK 搭配 Free/Pro/Max 订阅；2026 年起已在技术上封禁第三方 harness。
- 唯一的例外（用户登录未经修改的 Claude Code 二进制、由平台运行）需要同意 Commercial Terms，且是否适用于本地桌面 App 不明确。风险高，放弃。

**OpenAI（Codex CLI）→ 支持**：
- 官方态度开放：推出了「Sign in with ChatGPT」，高管公开表示欢迎第三方 harness（OpenCode、Pi 等已占 Codex 流量的约 10%）。
- ⚠️ 条款里没有明文保证，属于「默许」。我们驱动的是官方 Codex CLI（Apache-2.0 开源），风险低。

**Google（Gemini CLI → Antigravity CLI）→ 暂不支持**：
- 2026-05-19 Google I/O 宣布：Gemini CLI 对免费、Google AI Pro、Ultra 个人用户于 **2026-06-18 停止服务**，只保留给 Code Assist Standard/Enterprise 和付费 API key 用户（[Google Developers Blog](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)）。仓库里的旧文档未及时更新，曾误导本调研。
- 替代品 **Antigravity CLI（`agy`）**：闭源 Go 程序，与 Antigravity 2.0 桌面端共用后端；有无头模式（`--input-format=stream-json --output-format=stream-json`），但**没有官方 ACP 模式**（[feature request #31](https://github.com/google-antigravity/antigravity-cli/issues/31) 至今无官方回复），社区有若干非官方 ACP 包装。
- ❌ 官方 [FAQ](https://antigravity.google/docs/faq/) / [Terms](https://antigravity.google/terms/)：「Using third party software, tools, or services to access Antigravity is a violation」，可能导致封号；想在第三方 Agent 里用 Gemini，官方建议改用 Vertex / AI Studio API key。
- 执法很激进：2026-02、2026-09-03 都有付费 Ultra 用户因接入第三方工具被封（[Enterprise DNA](https://enterprisedna.co/resources/ai-pulse/ai-pulse-2026-09-03-google-suspends-paying-antigravity-subscribers-for-using-thi/)）。Google 账号被封对普通用户影响极大，风险不可接受。
- 以后可以关注：若 Google 为 `agy` 推出官方 ACP 或明确允许第三方客户端，再重新评估。

**未来可选：自带 API key 模式**：Anthropic、Google 都允许开发者产品使用 API key（按量付费）。可以作为高级选项接入 Claude / Gemini，但普通用户很少有 API key，不作为主路径。

**对设计的约束**：
1. 只驱动官方、未修改的 CLI 二进制，由官方方式安装；绝不提取、转发 CLI 的登录凭证。
2. 对外只用纯文字写「Works with Codex」，不使用对方的 logo。
3. 条款可能变化，需要定期复查；App 内保留切换 Agent 的能力。

> 以上为公开资料整理，不构成法律意见。

### 10.3 已安装清单的数据来源
Homebrew（formula / cask，`brew info --json`）、npm 全局、pipx、uv tool、cargo、Go bin、Mac App Store（mas）、/Applications。

### 10.4 上下文与记忆

五层上下文：

| 层 | 内容 | 注入方式 |
|---|---|---|
| 1. 身份与规则 | App 用途、用户不懂命令行、第 5 节的产品原则 | 专用工作目录里的 `AGENTS.md`（Codex 默认读取），每次都注入 |
| 2. 当前环境 | 系统、芯片、shell、网络、已安装清单摘要 | 开会话时注入 |
| 3. 长期记忆 | 用户偏好与习惯 | Agent 按需读取 |
| 4. 操作日志 | 装过 / 改过什么、为什么、如何撤销 | Agent 按需读取 |
| 5. 配方（Skills） | 常见任务的最佳做法，与「发现」Tab 共用 | 按需加载 |

**App 自身暴露一个 MCP 服务**，与具体 Agent 无关：
- `get_inventory()`、`recall(query)` / `remember(fact)`、`get_history()`、`show_card(question, options)`、`log_action(what, why, undo)`
- 记忆存在 App 里，切换 Agent 不丢失；UI 由 Agent 显式调用驱动，更稳定。
- 会话结束时由 App 额外跑一次总结写入记忆；记忆对用户可见、可删除。

### 10.5 已知的难点
- **管理员密码**：安装 Homebrew 等操作需要 sudo。App 不能代填密码，需要调起 macOS 原生的授权弹窗。
- **Xcode Command Line Tools**：Homebrew 依赖它，安装时会弹系统对话框，耗时也长，引导里要解释清楚。
- **来路不明的命令**：`curl ... | sh` 这类命令需要识别来源并提示风险。
- **网络诊断**：区分「完全没网」「连不上某个服务（GitHub / Homebrew / 模型 API）」「下载太慢超时」，分别用人话解释。

## 11. MVP 范围

✅ 按顺序推进：
1. 首次启动引导：选择 Agent → 安装 → 登录 → 装好 Homebrew
2. 助手 Tab：对话 + 授权卡片 + 提问卡片，跑通「粘贴命令 → 解释 → 确认 → 执行」
3. 已安装 Tab：先支持 Homebrew，再扩展到其他来源
4. 历史 Tab + 长期记忆
5. 发现 Tab：先放 Coming soon 占位

## 12. 未决问题

- ✅ 技术栈：Electron + TypeScript
- ✅ 产品名：**Termless**（寓意：不用终端）。termless.dev 已被一个 TUI 测试库占用；termless.app / termless.ai 查询时未注册。正式发布前需做 USPTO / EUIPO 商标检索
- ✅ 界面语言：默认英文，支持中文
- ❓ 「发现」里的内容以后如何维护（第一版先占位）
- 💡 订阅条款：已调研（见 10.2.1），Claude、Gemini/Antigravity 均不可行，第一版只支持 Codex，待确认
