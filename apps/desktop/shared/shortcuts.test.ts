import { describe, expect, it } from 'vitest'
import { getMissingShortcutActions } from './shortcuts'
import { defaultShortcutBindings, shortcutDefinitions } from './shortcuts'

describe('getMissingShortcutActions', () => {
  it('ignores mouse bindings and returns only unregistered system shortcuts', () => {
    const bindings = {
      screenshot: 'CommandOrControl+Shift+H',
      partialScreenshot: 'CommandOrControl+Shift+S',
      createRemotePairing: 'CommandOrControl+MouseButton4',
    } as Record<string, string>

    const missing = getMissingShortcutActions(
      bindings as never,
      (accelerator) => accelerator === 'CommandOrControl+Shift+S',
    )

    expect(missing).toEqual(['screenshot'])
  })
})

describe('debug shortcut', () => {
  it('defines a configurable default debug action', () => {
    expect(defaultShortcutBindings.debug).toBe('CommandOrControl+Shift+D')
    expect(shortcutDefinitions.find((definition) => definition.action === 'debug')).toMatchObject({
      label: '搜调试题',
      category: 'process'
    })
  })
})
