import { execFileResult } from '../exec.ts'
import type { Exec } from '../types.ts'

// Apple's Command Line Tools (git, compilers…). Homebrew and many tutorials
// need them. Without them, running `git` pops up Apple's install dialog.

export async function commandLineToolsInstalled(exec: Exec = execFileResult): Promise<boolean> {
  try {
    const { code, stdout } = await exec('/usr/bin/xcode-select', ['-p'], { timeoutMs: 10_000 })
    return code === 0 && stdout.trim().length > 0
  } catch {
    return false
  }
}

/** Opens Apple's own installer window. Needs no password; the user follows it. */
export async function openCommandLineToolsInstaller(exec: Exec = execFileResult): Promise<void> {
  await exec('/usr/bin/xcode-select', ['--install'], { timeoutMs: 10_000 })
}

/**
 * Bash, to run as root: installs the Command Line Tools without any window,
 * the way Homebrew's own install script does. Does nothing if they are
 * already there, and never fails the surrounding script.
 */
export const INSTALL_COMMAND_LINE_TOOLS_SCRIPT = `
if ! /usr/bin/xcode-select -p >/dev/null 2>&1; then
  placeholder=/tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
  /usr/bin/touch "$placeholder"
  label="$(/usr/sbin/softwareupdate -l 2>/dev/null | /usr/bin/grep -B 1 -E 'Command Line Tools' | /usr/bin/awk -F'*' '/^ *\\*/ {print $2}' | /usr/bin/sed -e 's/^ *Label: //' -e 's/^ *//' | /usr/bin/sort -V | /usr/bin/tail -n1)"
  if [ -n "$label" ]; then
    /usr/sbin/softwareupdate -i "$label" || true
    /usr/bin/xcode-select --switch /Library/Developer/CommandLineTools || true
  fi
  /bin/rm -f "$placeholder"
fi
`
