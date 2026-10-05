// Reading a page the user shared, without a confirmation card: it changes
// nothing on the Mac. GitHub repositories get their README and a few facts
// from GitHub's API; other pages get their text.

const MAX_CHARS = 30_000
const TIMEOUT_MS = 15_000

export interface PageText {
  url: string
  title: string | null
  /** Facts about a GitHub repository, when the URL is one. */
  repository: { name: string; description: string | null; language: string | null; license: string | null; stars: number | null } | null
  text: string
  truncated: boolean
}

/** github.com/<owner>/<repo>[/…] → owner/repo */
export function githubRepository(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null
    const [owner, repo] = u.pathname.split('/').filter(Boolean)
    return owner && repo ? `${owner}/${repo.replace(/\.git$/, '')}` : null
  } catch {
    return null
  }
}

export async function readPage(url: string, fetchImpl: typeof fetch = fetch): Promise<PageText> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Only web pages (http or https) can be read.')
  const repo = githubRepository(url)
  return repo ? readGithub(repo, fetchImpl) : readGeneric(url, fetchImpl)
}

const README_NAMES = ['README.md', 'readme.md', 'README.rst', 'README.txt', 'README']

/**
 * The README comes from raw.githubusercontent.com, which has no rate limit;
 * the API (60 requests an hour without signing in) only adds facts, and the
 * page still works without them.
 */
async function readGithub(repo: string, fetchImpl: typeof fetch): Promise<PageText> {
  const signal = () => AbortSignal.timeout(TIMEOUT_MS)
  const infoRequest = fetchImpl(`https://api.github.com/repos/${repo}`, {
    headers: { 'User-Agent': 'Termless', Accept: 'application/vnd.github+json' },
    signal: signal()
  }).catch(() => null)

  let readme: string | null = null
  for (const name of README_NAMES) {
    const response = await fetchImpl(`https://raw.githubusercontent.com/${repo}/HEAD/${name}`, { headers: { 'User-Agent': 'Termless' }, signal: signal() }).catch(() => null)
    if (response?.ok) {
      readme = await response.text()
      break
    }
  }

  const info = await infoRequest
  const meta = info?.ok
    ? ((await info.json()) as { full_name: string; description: string | null; language: string | null; license: { name: string } | null; stargazers_count: number })
    : null
  if (!meta && readme === null) {
    if (info?.status === 404) throw new Error(`GitHub has no public repository ${repo}.`)
    if (info?.status === 403 || info?.status === 429) {
      throw new Error(`No README found for ${repo}. The repository may not exist, and GitHub is limiting requests right now, so this can't be checked.`)
    }
    throw new Error(`GitHub could not be reached${info ? ` (it answered ${info.status})` : ''}.`)
  }
  return {
    url: `https://github.com/${repo}`,
    title: meta?.full_name ?? repo,
    repository: {
      name: meta?.full_name ?? repo,
      description: meta?.description ?? null,
      language: meta?.language ?? null,
      license: meta?.license?.name ?? null,
      stars: meta?.stargazers_count ?? null
    },
    ...clip(readme ?? '(This repository has no README.)')
  }
}

async function readGeneric(url: string, fetchImpl: typeof fetch): Promise<PageText> {
  const response = await fetchImpl(url, { headers: { 'User-Agent': 'Termless' }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' })
  if (!response.ok) throw new Error(`The page answered ${response.status}.`)
  const body = await response.text()
  const isHtml = /html/i.test(response.headers.get('content-type') ?? '') || /^\s*<(!doctype|html)/i.test(body)
  return {
    url: response.url || url,
    title: isHtml ? decodeEntities(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '') || null : null,
    repository: null,
    ...clip(isHtml ? htmlToText(body) : body)
  }
}

/** Good enough to read a tutorial: keeps code blocks and line breaks, drops scripts, styles and tags. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, '')
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, code: string) => `\n\`\`\`\n${code.replace(/<[^>]+>/g, '')}\n\`\`\`\n`)
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, code: string) => `\`${code.replace(/<[^>]+>/g, '')}\``)
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
}

function clip(text: string): { text: string; truncated: boolean } {
  return text.length > MAX_CHARS ? { text: `${text.slice(0, MAX_CHARS)}\n…`, truncated: true } : { text, truncated: false }
}
