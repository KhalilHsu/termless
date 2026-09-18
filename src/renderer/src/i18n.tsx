import { createContext, useContext, useState, type ReactNode } from 'react'

export type Lang = 'en' | 'zh'

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
  'assistant.comingSoon': 'Chatting with the assistant is coming soon.',
  'assistant.agent': 'AI agent',
  'assistant.codex.checking': 'Checking for Codex…',
  'assistant.codex.ready': 'Codex {version} is installed',
  'assistant.codex.missing': 'Codex is not installed yet. Termless will help you set it up in a later version.',
  'assistant.codex.broken': 'Codex was found but could not start. It may need to be reinstalled.',

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
  'detail.actionsSoon': 'Soon these will run through the Assistant, which explains each step and asks before changing anything.',
  'detail.showCommand': 'Show the command',
  'detail.hideCommand': 'Hide the command',
  'detail.copy': 'Copy',
  'detail.copied': 'Copied',

  'soon.title': 'Coming soon',
  'discover.body': 'Hand-picked tools and ready-made recipes you can install with one click.',
  'history.body': 'Everything Termless does on your Mac will be listed here, with a way to undo it.'
}

type Key = keyof typeof en

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
  'assistant.comingSoon': '与助手对话的功能即将推出。',
  'assistant.agent': 'AI 助手',
  'assistant.codex.checking': '正在检查 Codex…',
  'assistant.codex.ready': '已安装 Codex {version}',
  'assistant.codex.missing': '还没有安装 Codex。之后的版本里，Termless 会帮你装好。',
  'assistant.codex.broken': '找到了 Codex，但无法启动，可能需要重新安装。',

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
  'detail.actionsSoon': '这些操作之后会交给助手执行：先说明每一步，征得你同意后才会改动。',
  'detail.showCommand': '查看命令',
  'detail.hideCommand': '收起命令',
  'detail.copy': '复制',
  'detail.copied': '已复制',

  'soon.title': '即将推出',
  'discover.body': '精选的常用工具和现成的「配方」，一键安装。',
  'history.body': 'Termless 在你电脑上做过的每件事都会列在这里，并且可以撤销。'
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
      text = text.replace(`{${name}}`, String(value))
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
