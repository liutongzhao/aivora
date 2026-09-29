const isMacPlatform = () => {
  if (typeof navigator === 'undefined') return false
  return /mac/i.test(navigator.platform)
}

function mapPart(part: string, isMac: boolean): string {
  const normalized = part.trim()
  if (!normalized) return ''

  const mapping: Record<string, string> = {
    CommandOrControl: isMac ? '⌘' : 'Ctrl',
    Control: isMac ? '⌃' : 'Ctrl',
    Ctrl: isMac ? '⌃' : 'Ctrl',
    Shift: isMac ? '⇧' : 'Shift',
    Alt: isMac ? '⌥' : 'Alt',
    Option: isMac ? '⌥' : 'Alt',
    Meta: isMac ? '⌘' : 'Win',
    Enter: '↵',
    Return: '↵',
    Backspace: '⌫',
    Escape: 'Esc',
    '[': '[',
    ']': ']',
    MouseButton4: '鼠标侧键1',
    MouseButton5: '鼠标侧键2'
  }

  if (mapping[normalized]) {
    return mapping[normalized]
  }

  return normalized.length === 1 ? normalized.toUpperCase() : normalized
}

export function getShortcutParts(accelerator?: string): string[] {
  if (!accelerator) return []
  const isMac = isMacPlatform()
  return accelerator
    .split('+')
    .map(part => mapPart(part, isMac))
    .filter(Boolean)
}

export function formatShortcut(accelerator?: string): string {
  const parts = getShortcutParts(accelerator)
  if (!parts.length) return ''
  const isMac = isMacPlatform()
  return isMac ? parts.join('') : parts.join(' + ')
}
