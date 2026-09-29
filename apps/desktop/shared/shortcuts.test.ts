import { describe, expect, it } from 'vitest'
import { getMissingShortcutActions } from './shortcuts'

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
