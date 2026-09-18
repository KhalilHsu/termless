# Termless

面向全球 macOS 普通用户（不会用命令行）的开源桌面客户端（Electron + TypeScript）：通过对话和点击卡片，让本地的 CLI Agent（第一版只支持 Codex CLI；Claude Code、Gemini/Antigravity 因条款原因暂不支持，见产品笔记 10.2.1）帮用户完成命令行里的事。

产品定位、技术方案、上下文与记忆设计、MVP 范围见 [docs/product-notes.md](docs/product-notes.md)。开始任何开发工作前先读它。

## 开发

- `npm run dev` 开发运行；`npm run typecheck` 类型检查；`npm run build` 构建
- 自测截图：`npm run build && TERMLESS_VIEW=installed TERMLESS_CAPTURE=<path>.png npx electron .`
- 助手端到端测试：`scripts/e2e.sh`（隔离的数据目录，只做无害操作）
- 结构：`src/main`（主进程、brew、setup）、`src/main/codex`（Codex 检测、app-server JSON-RPC 客户端）、`src/main/agent`（会话、注入的规则、自定义工具、记忆）、`src/preload`（`window.termless` 桥）、`src/shared`（类型）、`src/renderer`（React UI，中英文案在 `i18n.tsx`）
- 约定：只读的 brew 调用必须带 `HOMEBREW_NO_AUTO_UPDATE=1`；渲染进程不直接接触 Node，所有系统能力经 preload 暴露；会改动用户电脑的操作必须先征得用户确认；Termless 使用独立的 `CODEX_HOME`，不读写用户的 `~/.codex`；绝不接触 Codex 的登录凭证
- 测试时不要影响开发者本机：用 `TERMLESS_USER_DATA` 指向临时目录，只执行无害命令

与用户沟通使用中文。
