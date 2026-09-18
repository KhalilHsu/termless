# Termless

面向全球 macOS 普通用户（不会用命令行）的开源桌面客户端（Electron + TypeScript）：通过对话和点击卡片，让本地的 CLI Agent（第一版只支持 Codex CLI；Claude Code、Gemini/Antigravity 因条款原因暂不支持，见产品笔记 10.2.1）帮用户完成命令行里的事。

产品定位、技术方案、上下文与记忆设计、MVP 范围见 [docs/product-notes.md](docs/product-notes.md)。开始任何开发工作前先读它。

## 开发

- `npm run dev` 开发运行；`npm run typecheck` 类型检查；`npm run build` 构建
- 自测截图：`npm run build && TERMLESS_VIEW=installed TERMLESS_CAPTURE=<path>.png npx electron .`
- 结构：`src/main`（主进程、brew/codex 检测）、`src/preload`（`window.termless` 桥）、`src/shared`（类型）、`src/renderer`（React UI，中英文案在 `i18n.tsx`）
- 约定：只读的 brew 调用必须带 `HOMEBREW_NO_AUTO_UPDATE=1`；渲染进程不直接接触 Node，所有系统能力经 preload 暴露；会改动用户电脑的操作必须先征得用户确认

与用户沟通使用中文。
