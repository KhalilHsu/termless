import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Lang } from '../../shared/types'

export type { Lang }

const en = {
  'nav.assistant': 'Assistant',
  'nav.installed': 'Installed',
  'nav.discover': 'Discover',
  'nav.history': 'History',
  'nav.language': 'Language',

  'status.ready': 'Ready',
  'status.loading': 'Reading your installed packages…',
  'status.error': 'Could not read installed packages',
  'status.summary': 'Homebrew {version} · {count} packages',

  'assistant.title': 'Assistant',
  'assistant.subtitle': 'Tell Termless what you want to do',
  'assistant.placeholder': 'Paste a command, a GitHub link, or describe what you want to do…',
  'assistant.send': 'Send',
  'assistant.stop': 'Stop',
  'assistant.newChat': 'New conversation',
  'assistant.memory': 'Memory',
  'assistant.savingMemory': 'Saving what I learned…',
  'assistant.thinking': 'Thinking…',
  'assistant.starting': 'Starting Codex…',
  'assistant.welcome.title': 'What would you like to do?',
  'assistant.welcome.body': 'Paste a command from a tutorial, share a GitHub link, or just describe what you need. I explain every step and ask before changing anything on your Mac.',
  'assistant.example.1': 'What have I installed with Homebrew?',
  'assistant.example.2': 'What does this command do? brew install wget',
  'assistant.example.3': 'I want to download a video from YouTube',
  'assistant.hint': 'Enter to send · Shift+Enter for a new line',
  'assistant.model': 'Codex · {model}',

  'card.risk.change': 'Wants to make a change on your Mac',
  'card.risk.install': 'Wants to install or update software',
  'card.risk.remove': 'Wants to remove something',
  'card.risk.admin': 'Needs administrator access',
  'card.risk.internet-script': 'Wants to run a script from the internet',
  'card.allow': 'Allow',
  'card.deny': "Don't allow",
  'card.running': 'Working on it…',
  'card.done': 'Done',
  'card.failed': "Didn't work",
  'card.declined': 'You said no — nothing was changed',
  'card.showDetails': 'Show details',
  'card.hideDetails': 'Hide details',
  'card.command': 'Command',
  'card.output': 'Output',
  'card.other': 'Something else…',
  'card.otherPlaceholder': 'Type your answer',
  'card.answer': 'Answer',
  'card.answered': 'You chose: {answer}',

  'error.codex-missing': 'Codex is not installed yet.',
  'error.codex-broken': 'Codex is installed but could not start.',
  'error.signed-out': 'Codex is not signed in.',

  'setup.title': 'Set up Termless',
  'setup.body': 'Termless uses a few tools to do command-line work for you. Let’s make sure they are ready.',
  'setup.refresh': 'Check again',
  'setup.start': 'Start using Termless',
  'setup.checking': 'Checking…',
  'setup.brew.title': 'Homebrew',
  'setup.brew.ok': 'Installed (version {version})',
  'setup.brew.missing': 'Not installed. Homebrew is the standard way to install software from tutorials. For now it needs to be installed by hand, because it asks for your Mac password.',
  'setup.brew.open': 'How to install',
  'setup.codex.title': 'Codex (the AI agent)',
  'setup.codex.ok': 'Installed (version {version})',
  'setup.codex.missing': 'Not installed yet.',
  'setup.codex.broken': 'Installed, but it could not start. Reinstalling usually fixes this.',
  'setup.codex.install': 'Install Codex',
  'setup.codex.reinstall': 'Reinstall Codex',
  'setup.codex.installing': 'Installing… this can take a minute or two.',
  'setup.codex.noInstaller': 'Install Homebrew first, then Termless can install Codex for you.',
  'setup.signin.title': 'Sign in to Codex',
  'setup.signin.ok': 'Signed in ({account})',
  'setup.signin.missing': 'Sign in with your ChatGPT account. It opens OpenAI’s page in your browser; Termless never sees your password.',
  'setup.signin.pending': 'Waiting for you to finish signing in in your browser…',
  'setup.signin.button': 'Sign in with ChatGPT',
  'setup.signin.needsCodex': 'Install Codex first.',
  'setup.failed': 'That didn’t work: {message}',

  'memory.title': 'What Termless remembers',
  'memory.body': 'Termless keeps these notes on this Mac so it doesn’t have to ask again. Delete anything you don’t want it to remember.',
  'memory.empty': 'Nothing yet.',
  'memory.forget': 'Forget',
  'memory.clear': 'Forget everything',
  'memory.clearConfirm': 'Forget everything Termless remembers about you?',
  'memory.close': 'Close',

  'installed.title': 'Installed',
  'installed.subtitle': 'Everything Homebrew has installed on this Mac',
  'installed.search': 'Search installed packages',
  'installed.heading': 'Your packages',
  'installed.count': '{count} packages',
  'installed.filter.all': 'All',
  'installed.filter.formula': 'Formulae',
  'installed.filter.cask': 'Casks',
  'installed.filter.updates': 'Updates',
  'installed.empty': 'Nothing matches your search.',
  'installed.select': 'Select a package to see its details.',
  'installed.retry': 'Try again',
  'installed.noBrew.title': 'Homebrew is not installed',
  'installed.noBrew.body': 'Homebrew is the tool most Mac tutorials use to install software. Termless will be able to install it for you in a later version.',

  'kind.formula': 'Formula',
  'kind.cask': 'Cask',
  'badge.outdated': 'Update available',
  'badge.upToDate': 'Up to date',
  'badge.dependency': 'Dependency',

  'detail.details': 'Details',
  'detail.installed': 'Installed',
  'detail.latest': 'Latest version',
  'detail.source': 'Source',
  'detail.homepage': 'Homepage',
  'detail.noDescription': 'No description available.',
  'detail.dependencies': 'Uses',
  'detail.noDependencies': 'Does not rely on other packages.',
  'detail.dependents': 'Used by',
  'detail.noDependents': 'No other installed package relies on it.',
  'detail.actions': 'Actions',
  'detail.upgrade': 'Update to {version}',
  'detail.uninstall': 'Uninstall',
  'detail.actionsHint': 'The Assistant will explain the step and ask before changing anything.',
  'detail.useIt': 'What can I do with it?',
  'prompt.upgrade': 'Please update {name} ({kind} "{id}") to the latest version.',
  'prompt.uninstall': 'Please uninstall {name} ({kind} "{id}"). Before that, tell me whether anything else relies on it.',
  'prompt.useIt': 'What is {name} ({kind} "{id}") for, and what could I do with it? Keep it short.',
  'detail.showCommand': 'Show the command',
  'detail.hideCommand': 'Hide the command',
  'detail.copy': 'Copy',
  'detail.copied': 'Copied',

  'history.title': 'History',
  'history.subtitle': 'Your past conversations',
  'history.search': 'Search conversations',
  'history.empty': 'No conversations yet. Start one in the Assistant.',
  'history.noMatch': 'No conversation matches your search.',
  'history.current': 'Current',
  'history.delete': 'Delete',
  'history.deleteConfirm': 'Delete this conversation? This can’t be undone.',
  'history.clear': 'Delete all',
  'history.clearConfirm': 'Delete all conversations? This can’t be undone.',
  'history.today': 'Today',
  'history.yesterday': 'Yesterday',
  'history.thisWeek': 'Earlier this week',
  'history.older': 'Older',
  'history.switchConfirm': 'The assistant is still working on the current conversation. Stop it and switch?',
  'card.stopped': 'Stopped before it finished',
  'card.expired': 'No longer waiting for an answer',
  'soon.title': 'Coming soon',
  'discover.body': 'Hand-picked tools and ready-made recipes you can install with one click.',
}

export type Key = keyof typeof en

const zh: Record<Key, string> = {
  'nav.assistant': '助手',
  'nav.installed': '已安装',
  'nav.discover': '发现',
  'nav.history': '历史',
  'nav.language': '语言',

  'status.ready': '就绪',
  'status.loading': '正在读取已安装的软件…',
  'status.error': '读取已安装的软件失败',
  'status.summary': 'Homebrew {version} · 共 {count} 个软件',

  'assistant.title': '助手',
  'assistant.subtitle': '告诉 Termless 你想做什么',
  'assistant.placeholder': '粘贴一条命令、一个 GitHub 链接，或者描述你想做的事…',
  'assistant.send': '发送',
  'assistant.stop': '停止',
  'assistant.newChat': '新对话',
  'assistant.memory': '记忆',
  'assistant.savingMemory': '正在记下这次学到的东西…',
  'assistant.thinking': '思考中…',
  'assistant.starting': '正在启动 Codex…',
  'assistant.welcome.title': '想做点什么？',
  'assistant.welcome.body': '粘贴教程里的命令、发一个 GitHub 链接，或者直接说你想做什么。每一步我都会先说明，改动你的电脑之前一定先问你。',
  'assistant.example.1': '我用 Homebrew 装过哪些东西？',
  'assistant.example.2': '这条命令是干什么的？brew install wget',
  'assistant.example.3': '我想下载一个 YouTube 视频',
  'assistant.hint': 'Enter 发送 · Shift+Enter 换行',
  'assistant.model': 'Codex · {model}',

  'card.risk.change': '需要改动你的电脑',
  'card.risk.install': '需要安装或更新软件',
  'card.risk.remove': '需要删除一些东西',
  'card.risk.admin': '需要管理员权限',
  'card.risk.internet-script': '需要运行一个从网上下载的脚本',
  'card.allow': '允许',
  'card.deny': '不允许',
  'card.running': '正在进行…',
  'card.done': '完成',
  'card.failed': '没有成功',
  'card.declined': '你拒绝了，没有做任何改动',
  'card.showDetails': '查看详情',
  'card.hideDetails': '收起详情',
  'card.command': '命令',
  'card.output': '输出',
  'card.other': '其他…',
  'card.otherPlaceholder': '输入你的回答',
  'card.answer': '回答',
  'card.answered': '你选择了：{answer}',

  'error.codex-missing': '还没有安装 Codex。',
  'error.codex-broken': 'Codex 已安装，但无法启动。',
  'error.signed-out': 'Codex 还没有登录。',

  'setup.title': '设置 Termless',
  'setup.body': 'Termless 要借助几个工具来替你完成命令行里的事，先确认它们都准备好了。',
  'setup.refresh': '重新检查',
  'setup.start': '开始使用',
  'setup.checking': '检查中…',
  'setup.brew.title': 'Homebrew',
  'setup.brew.ok': '已安装（版本 {version}）',
  'setup.brew.missing': '还没有安装。Homebrew 是教程里最常用的软件安装工具。它需要输入你的 Mac 密码，所以目前需要你手动安装。',
  'setup.brew.open': '如何安装',
  'setup.codex.title': 'Codex（AI 助手）',
  'setup.codex.ok': '已安装（版本 {version}）',
  'setup.codex.missing': '还没有安装。',
  'setup.codex.broken': '已安装，但无法启动。通常重新安装就能解决。',
  'setup.codex.install': '安装 Codex',
  'setup.codex.reinstall': '重新安装 Codex',
  'setup.codex.installing': '正在安装…可能需要一两分钟。',
  'setup.codex.noInstaller': '请先安装 Homebrew，之后 Termless 可以帮你装 Codex。',
  'setup.signin.title': '登录 Codex',
  'setup.signin.ok': '已登录（{account}）',
  'setup.signin.missing': '用你的 ChatGPT 账号登录。会在浏览器里打开 OpenAI 的页面，Termless 不会接触你的密码。',
  'setup.signin.pending': '请在浏览器里完成登录…',
  'setup.signin.button': '用 ChatGPT 登录',
  'setup.signin.needsCodex': '请先安装 Codex。',
  'setup.failed': '没有成功：{message}',

  'memory.title': 'Termless 记住了什么',
  'memory.body': '这些笔记只保存在这台 Mac 上，这样下次就不用再问你。不想被记住的，随时可以删掉。',
  'memory.empty': '还没有。',
  'memory.forget': '忘掉',
  'memory.clear': '全部忘掉',
  'memory.clearConfirm': '确定让 Termless 忘掉关于你的所有内容吗？',
  'memory.close': '关闭',

  'installed.title': '已安装',
  'installed.subtitle': '这台 Mac 上通过 Homebrew 安装的所有软件',
  'installed.search': '搜索已安装的软件',
  'installed.heading': '你的软件',
  'installed.count': '共 {count} 个',
  'installed.filter.all': '全部',
  'installed.filter.formula': '命令行工具',
  'installed.filter.cask': '应用',
  'installed.filter.updates': '可更新',
  'installed.empty': '没有符合搜索条件的软件。',
  'installed.select': '选择一个软件查看详情。',
  'installed.retry': '重试',
  'installed.noBrew.title': '还没有安装 Homebrew',
  'installed.noBrew.body': 'Homebrew 是大多数 Mac 教程用来安装软件的工具。之后的版本里，Termless 可以帮你装好它。',

  'kind.formula': '命令行工具',
  'kind.cask': '应用',
  'badge.outdated': '可更新',
  'badge.upToDate': '已是最新',
  'badge.dependency': '依赖项',

  'detail.details': '详情',
  'detail.installed': '已安装版本',
  'detail.latest': '最新版本',
  'detail.source': '来源',
  'detail.homepage': '主页',
  'detail.noDescription': '暂无说明。',
  'detail.dependencies': '它依赖',
  'detail.noDependencies': '不依赖其他软件。',
  'detail.dependents': '被谁依赖',
  'detail.noDependents': '没有其他已安装的软件依赖它。',
  'detail.actions': '操作',
  'detail.upgrade': '更新到 {version}',
  'detail.uninstall': '卸载',
  'detail.actionsHint': '助手会先说明要做什么，征得你同意后才会改动。',
  'detail.useIt': '它能用来做什么？',
  'prompt.upgrade': '请把 {name}（{kind}「{id}」）更新到最新版本。',
  'prompt.uninstall': '请卸载 {name}（{kind}「{id}」）。卸载前先告诉我有没有其他软件依赖它。',
  'prompt.useIt': '{name}（{kind}「{id}」）是做什么用的？我可以用它做些什么？简短说明即可。',
  'detail.showCommand': '查看命令',
  'detail.hideCommand': '收起命令',
  'detail.copy': '复制',
  'detail.copied': '已复制',

  'history.title': '历史',
  'history.subtitle': '过去的对话',
  'history.search': '搜索对话',
  'history.empty': '还没有对话。去助手里开始第一段吧。',
  'history.noMatch': '没有符合搜索条件的对话。',
  'history.current': '当前',
  'history.delete': '删除',
  'history.deleteConfirm': '删除这段对话？删除后无法恢复。',
  'history.clear': '全部删除',
  'history.clearConfirm': '删除所有对话？删除后无法恢复。',
  'history.today': '今天',
  'history.yesterday': '昨天',
  'history.thisWeek': '本周早些时候',
  'history.older': '更早',
  'history.switchConfirm': '助手还在处理当前的对话。要停下来并切换吗？',
  'card.stopped': '没有做完就停止了',
  'card.expired': '已不再等待回答',
  'soon.title': '即将推出',
  'discover.body': '精选的常用工具和现成的「配方」，一键安装。',
}

const dictionaries: Record<Lang, Record<Key, string>> = { en, zh }

export type Translate = (key: Key, vars?: Record<string, string | number>) => string

interface I18n {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Translate
}

const I18nContext = createContext<I18n | null>(null)

const STORAGE_KEY = 'termless.lang'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'zh') return saved
  } catch {
    // storage unavailable; fall through to the default
  }
  return 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  const setLang = (next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // not critical
    }
  }

  const t: Translate = (key, vars) => {
    let text = dictionaries[lang][key]
    for (const [name, value] of Object.entries(vars ?? {})) {
      text = text.split(`{${name}}`).join(String(value))
    }
    return text
  }

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
