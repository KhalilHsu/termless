# Termless

面向全球 macOS 普通用户（不会用命令行）的开源桌面客户端（Electron + TypeScript）：通过对话和点击卡片，让本地的 CLI Agent（第一版只支持 Codex CLI；Claude Code、Gemini/Antigravity 因条款原因暂不支持，见产品笔记 10.2.1）帮用户完成命令行里的事。

产品定位、技术方案、上下文与记忆设计、MVP 范围见 [docs/product-notes.md](docs/product-notes.md)。开始任何开发工作前先读它。

## 开发

- `npm run dev` 开发运行；`npm run typecheck` 类型检查；`npm test` hostkit 单元测试；`npm run build` 构建
- 自测截图：`npm run build && TERMLESS_VIEW=installed TERMLESS_CAPTURE=<path>.png npx electron .`
- 端到端测试：`scripts/e2e.sh [core|safety|undo|plan]`（默认全部；隔离的数据目录，只做无害操作，有风险的卡片一律点「不允许」；结束时删除它创建的所有 Codex 线程；任一检查失败则以非零状态退出）。套件在 `scripts/e2e/`，公共操作在 `lib.mjs`
- 打包并安装到本机：`npm run install:mac`（打包、ad-hoc 签名、替换 `/Applications/Termless.app`，并删除 `release/` 里的产物，避免启动台出现多个 Termless）。测试用的临时 .app 副本用完必须删除
- 结构：`src/hostkit`（独立模块：本机安装情况的检测与管理命令、管理员权限、安装 Homebrew；不依赖 Electron 和 Termless，供其他项目复用，见其 README）、`src/main`（主进程、清单缓存、setup）、`src/main/codex`（Codex 检测、app-server JSON-RPC 客户端）、`src/main/agent`（会话、对话保存 `conversations.ts`、注入的规则、自定义工具、记忆）、`src/preload`（`window.termless` 桥）、`src/shared`（类型）、`src/renderer`（React UI，中英文案在 `i18n.tsx`）
- 产品约定：聊天只在助手里进行；历史 Tab 只列出对话，点开后切到助手继续。
- 约定：只读的包管理器调用一律用 hostkit 的 `readOnlyEnv()`（含 `HOMEBREW_NO_AUTO_UPDATE=1`）；hostkit 只生成命令、不擅自执行改动，且不能 import Termless / Electron 的代码；需要管理员权限一律走 macOS 原生授权弹窗（`runAsAdmin`），不碰密码；渲染进程不直接接触 Node，所有系统能力经 preload 暴露；会改动用户电脑的操作必须先征得用户确认；Termless 使用独立的 `CODEX_HOME`，不读写用户的 `~/.codex`；绝不接触 Codex 的登录凭证
- 测试时不要影响开发者本机：用 `TERMLESS_USER_DATA` 指向临时目录，只执行无害命令

与用户沟通使用中文。
