# Termless 产品笔记

> 最后更新：2026-10-05。标注说明：✅ 已确认；💡 提议，待确认；❓ 未决。

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
5. **出问题了**：「昨天装的东西好像把什么搞坏了」→ 在「历史」里找到那段对话，接着让助手撤销（改动都留在对话的卡片里，助手也记得做过什么）。

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
| **历史** | 过去的**对话**列表（不是“改动记录”，小白用户没有这个概念）：自动标题、按日期分组、搜索、删除。点开一段对话会切到助手里显示，可以直接接着聊 |

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
- ✅ 第一版**只支持 Codex CLI**（ChatGPT 账号登录）。内部保留统一的 Agent 适配层，以后条款允许时再接入其他 Agent。
- ✅ **不支持 Claude Code**：条款不允许第三方产品以常规方式驱动 Claude 订阅（见 10.2.1）。
- ❌ **Gemini CLI**：个人账号（免费 / Pro / Ultra）已于 2026-06-18 停止服务，由闭源的 Antigravity CLI 取代（见 10.2.1）。
- ⚠️ **Antigravity CLI**：条款禁止用第三方软件访问 Antigravity，且没有官方 ACP，暂不支持（见 10.2.1）。
- 协议层：Codex 可用 ACP 适配器，或 `codex exec --json` / `codex app-server`。
- 不解析 TUI 屏幕输出，只用结构化事件（工具调用、输出、授权请求、提问）。
- ✅ **只通过 CLI 调用**，不打开也不依赖它们的桌面客户端。
- 登录一律走各 CLI 自己的官方流程（浏览器登录），App **永不接触 token**。
- ✅ 用户没有可用的 AI 账号：直接告知无法使用并说明原因（本产品依赖 AI）。
- ✅ 会话记录问题已解决：Termless 使用独立的 `CODEX_HOME`，线程只保存在那里（用于继续对话），不会出现在用户自己的 Codex 历史里；删除对话即删除线程。

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
✅ 已实现为独立模块 **hostkit**（`src/hostkit/`，见其 README）。它不依赖 Termless 和 Electron，只用 Node 内置模块，别的项目可以直接拷走复用（或以后发布成包）。

- 来源：Homebrew（formula / cask）、App Store（有 App Store 收据的应用；装了 `mas` 时还能查更新）、/Applications 和 ~/Applications 里的其他应用、npm 全局、pnpm 全局、pipx、uv tool、cargo、Go bin。
- 每个来源实现同一个 `PackageSource` 接口（探测 → 列出 → 生成更新 / 卸载命令），新增一个包管理器只需写一个文件。各来源并行读取、互不影响：某个来源读取失败只标记它自己。
- 同一个东西只列一次：Homebrew cask 装的 .app 由 Homebrew 认领，不会在「应用程序文件夹」里重复出现。
- hostkit 只读：它只**生成**命令（`CommandSpec`），由宿主 App 决定是否执行。在 Termless 里，这些命令交给助手，助手解释后经确认卡片执行。
- 跳过的内容：macOS 自带的 Apple 应用；浏览器创建的网页应用（它们归浏览器管理）。
- 占用空间按需计算（打开详情时用 `du` 测量），不在列表加载时全部计算，因为大应用要算好几秒。
- 从 Finder 启动的 App 拿不到用户 shell 的 PATH：hostkit 会查常见安装位置，并在启动时向登录 shell 要一次 PATH，所以 nvm、asdf 装的工具也能找到。

### 10.4 上下文与记忆

五层上下文：

| 层 | 内容 | 注入方式 |
|---|---|---|
| 1. 身份与规则 | App 用途、用户不懂命令行、第 5 节的产品原则 | app-server 的 `developerInstructions`，每个新对话注入（实现见 `src/main/agent/instructions.ts`） |
| 2. 当前环境 | 系统、芯片、shell、网络、已安装清单摘要 | 开会话时注入 |
| 3. 长期记忆 | 用户偏好与习惯 | Agent 按需读取 |
| 4. 操作日志 | 装过 / 改过什么、为什么、如何撤销 | Agent 按需读取 |
| 5. 配方（Skills） | 常见任务的最佳做法，与「发现」Tab 共用 | 按需加载 |

**App 向 Agent 提供自定义工具**（已实现为 Codex dynamic tools；将来接入其他 Agent 时可再包成 MCP 服务），与具体 Agent 无关：
- `termless_get_inventory`（全部来源）、`termless_recall` / `termless_remember` / `termless_forget`、`termless_get_recent_actions`、`termless_ask_user`、`termless_log_action`、`termless_run_as_admin`（先确认，再弹 macOS 原生密码框）
- 记忆存在 App 里，切换 Agent 不丢失；UI 由 Agent 显式调用驱动，更稳定。
- 会话结束时由 App 额外跑一次总结写入记忆；记忆对用户可见、可删除。

### 10.5 已知的难点
- ✅ **管理员密码**：已解决。需要管理员权限的命令由 macOS 原生授权弹窗执行（`osascript … with administrator privileges`），密码只交给 macOS，Termless 看不到。助手要用管理员权限时调用 `termless_run_as_admin`（附一句理由），先出确认卡片，用户允许后才弹系统密码框。brew / pipx / uv / cargo 以及修改系统安全设置的命令会被直接拒绝，不会以 root 运行。
- ✅ **安装 Homebrew**：使用 Homebrew 官方的 .pkg 安装包（GitHub Release 上发布，经过 Apple 公证）。下载后先校验签名团队和公证，再安装；整个过程只弹一次密码框，缺少 Command Line Tools 时也一起装上（用 `softwareupdate`，和 Homebrew 官方安装脚本的做法一样）。安装包会把 Homebrew 写进系统 PATH（`/etc/paths.d/homebrew`），不用改用户的 `.zprofile`。⚠️ 这个安装包只支持 Apple 芯片和 macOS 15 及以上；其他 Mac 目前提示用户手动安装（见 14 节 P3）。
- **Xcode Command Line Tools**：安装 Homebrew 时一起装上（见上条）。已经有 Homebrew 但缺 CLT 的 Mac，引导里会提供按钮打开 Apple 自己的安装窗口。
- **来路不明的命令**：`curl ... | sh` 这类命令需要识别来源并提示风险。
- **网络诊断**：区分「完全没网」「连不上某个服务（GitHub / Homebrew / 模型 API）」「下载太慢超时」，分别用人话解释。

## 11. MVP 范围

✅ 按顺序推进（2026-10-05 全部完成）：
1. ✅ 首次启动引导：选择 Agent → 安装 → 登录 → 装好 Homebrew
2. ✅ 助手 Tab：对话 + 授权卡片 + 提问卡片，跑通「粘贴命令 → 解释 → 确认 → 执行」
3. ✅ 已安装 Tab：先支持 Homebrew，再扩展到其他来源
4. ✅ 历史 Tab（会话历史，可继续对话）+ 长期记忆
5. ✅ 发现 Tab：先放 Coming soon 占位

## 12. 进度

- 2026-10-05（第二次）：**P0 第 0.4 项商标检索完成**（中国待补），结论和建议见 [trademark-search.md](trademark-search.md)。0.1～0.3 暂缓：0.1 / 0.2 需要 macOS 虚拟机，0.3 需要付费的 Apple Developer 账号。
- 2026-10-05：**MVP 剩余两项完成：管理员权限 + 已安装支持全部来源**。
  - 新的独立模块 hostkit（`src/hostkit/`）：负责本机安装情况的检测、描述和管理命令，供 Termless 和以后的其他项目使用（见 10.3）。有自己的 README 和单元测试（`npm test`，用录制的命令输出测试各来源的解析，不需要本机装有这些工具）。
  - 已安装 Tab：显示 9 类来源的内容；按「应用 / 命令行工具 / 可更新」筛选，并可按安装方式筛选；每一项标明是用什么装的、提供哪些命令、占用多少空间，可以在访达中显示；读取失败的来源单独提示；没装 Homebrew 时可直接安装。更新、卸载照旧交给助手，应用的卸载是「移到废纸篓」，可以放回。
  - 助手：`termless_get_inventory` 覆盖全部来源，并带上每一项准确的更新 / 卸载命令；开对话时注入的环境信息里也列出各个包管理器；新增 `termless_run_as_admin`（见 10.5），确认卡片上显示助手给出的理由，并提示接下来 macOS 会要密码。
  - 首次启动引导：Homebrew 一步可以直接安装（下载进度 → 校验 → 系统密码框 → 安装 CLT / Homebrew）；Homebrew 已装但缺少 CLT 时，提供安装 CLT 的按钮。
  - 端到端测试新增：多来源清单、助手按来源回答、管理员卡片（只测「不允许」，不会真的弹密码框）、以 root 运行 brew 被拒绝。
  - 未能端到端实测的部分：在一台没有 Homebrew 的 Mac 上真正走完安装（开发机已经装了 Homebrew）。已经实测的有：下载官方安装包、校验签名和公证（伪造的包、签名团队不对的包都会被拒绝）、管理员命令的参数传递和输出解析（去掉提权后实际运行）。需要在一台干净的 Mac 或虚拟机上补测，见 14 节 P0。
- 2026-09-19：**会话历史完成**。
  - 设计原则：**聊天只在助手里进行；历史只负责找对话**。点开历史里的对话 → 助手切换到那段对话，输入框直接接着聊。当前对话也在历史列表里（标“当前”），切走不会丢。
  - 助手正在执行或等待确认时切换：先弹窗确认，确认后停止当前任务再切换；停下的卡片标为“没有做完就停止了”，未回答的提问标为“已不再等待回答”。
  - 每段对话实时保存到 App 数据目录 `conversations/`；离开一段对话时在后台提炼记忆，并由模型生成简短标题。
  - 继续旧对话：优先用 Codex `thread/resume` 恢复原线程（Codex 记得全部上下文），并重新注入最新的环境和记忆；恢复失败时自动新开线程、带上之前的对话内容兜底，并提示用户。
  - Codex 线程不再是临时的（保存在 Termless 独立的 `CODEX_HOME` 里）；删除对话会同时删除对应的 Codex 线程。
  - 改动不再作为单独界面：App 在每轮对话结束时自动记录执行过的改动（Agent 忘了调用 `termless_log_action` 也不会漏），仅作为注入给 Agent 的上下文；记忆面板只显示“记住的事实”。
- 2026-09-18（第二次）：**助手 Agent 核心链路完成**，已端到端实测。
  - 通过 `codex app-server`（JSON-RPC）驱动 Codex，模型 `gpt-5.6-terra`、推理强度 low。
  - 对话：流式回复、简易 Markdown、停止、新对话。
  - 确认卡片：审批策略 `untrusted`，凡不是明显只读的命令 / 文件修改都先弹卡片；按风险分级（改动 / 安装 / 删除 / 管理员 / 网上脚本）配色；命令和输出默认折叠。批准后以用户权限执行（`danger-full-access`），以便 brew 安装能工作。
  - 提问卡片：Agent 调用 `termless_ask_user` 弹出选项，也兼容 Codex 自带的 request_user_input。
  - 注入内容（10.4 的第 1~4 层）：产品规则、这台 Mac 的环境（系统、芯片、Homebrew 概况、网络连通性）、长期记忆、最近的改动，通过 `developerInstructions` 在每个新对话开始时注入。
  - 自定义工具（Codex dynamic tools，取代原计划的 MCP 服务）：`termless_get_inventory`、`termless_ask_user`、`termless_remember` / `recall` / `forget`、`termless_log_action`、`termless_get_recent_actions`。
  - 长期记忆：存在 App 数据目录的 `memory.json`；对话中 Agent 主动记；点「新对话」或退出 App 时，另开只读线程总结对话提炼事实；「记忆」面板可查看、逐条删除、全部清空。
  - 隔离：Termless 用独立的 `CODEX_HOME`，用户个人的 Codex 设置（全局 AGENTS.md、MCP、skills）不会混进来，也不会被改动；线程为 ephemeral，不写 Codex 历史。
  - 首次启动引导：检测 Homebrew / Codex / 登录状态；可一键安装 Codex（先弹原生对话框说明并确认）、用 ChatGPT 登录（Codex 官方流程，Termless 不接触凭证）。
  - 已安装 Tab：「更新」「卸载」「它能做什么」按钮接入助手，由助手说明并弹确认卡片执行；执行后自动刷新列表。
  - 已知限制：需要 sudo 的操作（如安装 Homebrew 本身）暂不支持，Agent 会说明需要手动完成。
- 2026-09-18：Electron 骨架完成。四个 Tab + 中英文切换；**已安装** Tab 读取真实的 Homebrew 数据（参考 Homebrew GUI 的三栏布局：侧边栏 / 列表 / 详情），支持搜索、按类型和「可更新」筛选、依赖与被依赖关系、命令默认折叠；更新 / 卸载按钮暂为禁用，之后经助手确认执行。**助手** Tab 目前只检测 Codex 是否安装、能否启动；发现、历史为占位。

## 13. 未决问题

- ✅ 技术栈：Electron + TypeScript
- ✅ 产品名：**Termless**（寓意：不用终端）。termless.dev 已被一个 TUI 测试库占用；termless.app / termless.ai 查询时未注册。
  - 2026-10-05 已做商标初步检索，详见 [trademark-search.md](trademark-search.md)：美国、欧盟、英国及 WIPO 覆盖的约 90 个局里，没有在用的 TERMLESS 商标；最近似的是第 9 / 42 类的 TERMLY（英国、澳大利亚）。实际风险最大的是同名开发者工具 termless.dev（npm `termless`，在先使用但没有注册商标）。中国还需要你本人检索。
  - ❓ 保留这个名字（尽快注册 termless.app，并在美国、欧盟申请第 9 / 42 类商标），还是趁发布前改名？
- ✅ 界面语言：默认英文，支持中文
- ❓ 「发现」里的内容以后如何维护（第一版先占位）
- ✅ 订阅条款：已调研（见 10.2.1），Claude、Gemini/Antigravity 均不可行，第一版只支持 Codex

## 14. 后续计划（MVP 之后）

> 💡 2026-10-05 提议，待确认。收集了前面各节提到、但还没排进计划的事，以及这次开发中新发现的。按优先级分组，组内按建议顺序排列。

### P0：发布前必须做

| # | 事项 | 来源 | 做法 | 怎么算完成 |
|---|---|---|---|---|
| 0.1 | ⏸ **干净环境实测**（2026-10-05 决定暂缓） | 第 8 节成功标准、12 节 | 在 macOS 虚拟机（Apple 芯片可用 Virtualization.framework，例如 UTM / tart）里，从零开始：下载 App → 引导里装好 Homebrew → 装 Codex → 登录 → 完成一篇教程 | 全程不打开终端、10 分钟内装好第一个工具；把过程录屏，问题记成 issue |
| 0.2 | ⏸ **典型教程测试集**（暂缓，同上） | 第 8 节「能完成一篇典型教程」 | 挑 10 篇真实的教程 / README（yt-dlp、ffmpeg、ComfyUI、Ollama、一个 Python CLI、一个 npm CLI 等），写成可重复的端到端场景，定期跑 | ≥ 8 篇不用人插手就能完成；失败的写清原因 |
| 0.3 | ⏸ **正式签名、公证和自动更新**（暂缓：需要付费 Apple Developer 账号和 Developer ID 证书） | 第 1 节目标（真实用户） | Apple Developer ID 签名 + notarize；用 electron-updater 走 GitHub Releases 自动更新 | 从网上下载后能正常打开，Gatekeeper 不报警；能自动升级到新版本 |
| 0.4 | ✅ **商标检索**（2026-10-05，中国待补） | 13 节 | 检索 USPTO、EUIPO、UKIPO、WIPO 全球品牌数据库，以及 npm / GitHub / 域名，结果见 [trademark-search.md](trademark-search.md) | 有结论：没有在册的同名商标；是否改名待你决定（13 节）；中国商标网需要你本人检索 |

### P1：补齐产品原则

| # | 事项 | 来源 | 做法 | 怎么算完成 |
|---|---|---|---|---|
| 1.1 | **网络诊断** | 原则 5、10.5 | 在 hostkit 里加一个 `diagnoseNetwork()`：依次检查 DNS、能否连上 GitHub / Homebrew / npm / PyPI / OpenAI、是否设置了代理、下载速度；把结果分成「完全没网」「某个服务连不上」「太慢会超时」三类。命令失败、而输出里有网络错误时，助手调用它，再用人话解释；用户需要时，助手可以按用户的要求配置代理或镜像（属于改动，需要确认） | 断网、屏蔽 GitHub、限速这三种情况，助手都能说清是哪里不通、可以怎么办 |
| 1.2 | **来路不明的命令** | 原则 2、10.5 | 识别 `curl … \| sh`、`bash <(curl …)`、`base64 -d \| sh` 等写法；下载脚本先不执行，读出内容让助手审一遍（来源域名是否知名、脚本里有没有 sudo / 删除 / 改系统设置）；确认卡片上增加「来源」和「这个脚本会做什么」 | 网上脚本的卡片上能看到来源和摘要；明显恶意的样例（删文件、上传钥匙串）会被助手警告并拒绝 |
| 1.3 | **撤销** | 原则 3、场景 5 | 每次改动在操作日志里存一条结构化记录，包括「怎么撤销」（安装 ↔ 卸载用 hostkit 的 `CommandSpec`；删应用 → 从废纸篓放回；改配置 → 先备份原文件）。历史里的对话增加「撤销这次改动」入口，交给助手执行，同样走确认卡片 | 安装、卸载、改配置文件三类改动都能一键撤销，并有端到端测试 |
| 1.4 | **场景 2：GitHub 链接 → 步骤卡片** | 场景 2 | 助手读 README 后，先给出一张「计划卡片」（要装的环境和每一步，用人话写），用户确认整体计划，然后逐步执行；计划卡片上的进度跟着执行更新 | 给 3 个真实仓库的链接都能出计划并完成；中途失败时卡片会标出停在哪一步 |
| 1.5 | **Intel Mac 和旧 macOS 也能装 Homebrew** | 10.5 | 这些 Mac 用不了官方 .pkg，改用官方 install.sh，配合 `SUDO_ASKPASS` 指向一个弹原生密码框的小程序（不经过 Termless 进程） | Intel 虚拟机上能从引导里装好 Homebrew |

### P2：让它更好用

| # | 事项 | 来源 | 做法 |
|---|---|---|---|
| 2.1 | **配方（Skills）+ 发现 Tab** | 10.4 第 5 层、第 6 节、13 节未决问题 | 配方是一个公开 Git 仓库里的 Markdown / YAML 文件（「视频下载套装」「本地 AI 画图环境」），社区用 PR 贡献、维护者审核；App 定期拉取。助手按需加载配方，发现 Tab 展示同一份内容并支持一键安装（仍走助手 + 确认卡片）。这样也就回答了「发现里的内容以后如何维护」 |
| 2.2 | **已安装：更多来源和信息** | 10.3 | 新增 bun、Volta / nvm 下的多个 Node 版本、Homebrew services（后台服务）；没装 mas 时也能查 App Store 更新（iTunes Search API）；列表一次显示所有项的占用空间（后台慢慢算并缓存） |
| 2.3 | **批量操作** | 场景 4 | 「全部更新」「清理不再需要的依赖（`brew autoremove`）」，由助手先列出清单再确认 |
| 2.4 | **记忆和改动对用户可见** | 10.4 | 记忆面板里显示「Termless 在这台 Mac 上做过的事」（只读时间线，可以从这里撤销，与 1.3 合并） |

### P3：长期

| # | 事项 | 来源 | 说明 |
|---|---|---|---|
| 3.1 | **Agent 适配层** | 10.2、10.2.1 约束 3 | 现在 `session.ts` 是按 Codex app-server 写的。把它抽象成 Agent 接口（开会话、发消息、审批、工具调用），Codex 是第一个实现；以后条款允许时再接入其他 Agent |
| 3.2 | **自带 API key 模式** | 10.2.1 | 作为高级选项接入 Claude / Gemini API key（按量付费），依赖 3.1 |
| 3.3 | **条款定期复查** | 10.2.1 约束 3 | 每季度复查 OpenAI / Anthropic / Google 的条款，结论记在 10.2.1 |
| 3.4 | **hostkit 独立发布** | 10.3 | 等接口稳定后发布到 npm（发布时编译成 JS + 类型声明），供其他项目使用 |

