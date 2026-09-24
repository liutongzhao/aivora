import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { defaultShortcutBindings, ShortcutAction } from '../../shared/shortcuts'

type ShortcutMap = Record<ShortcutAction, string>

interface ShortcutContextValue {
  bindings: ShortcutMap
}

const ShortcutContext = createContext<ShortcutContextValue>({
  bindings: defaultShortcutBindings
})

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const [bindings, setBindings] = useState<ShortcutMap>(defaultShortcutBindings)

  useEffect(() => {
    let mounted = true

    const loadBindings = async () => {
      try {
        const result = await window.electronAPI.getShortcutBindings()
        if (mounted && result) {
          setBindings(result as ShortcutMap)
        }
      } catch (error) {
        console.error('加载快捷键信息失败:', error)
      }
    }

    loadBindings()
    const unsubscribe = window.electronAPI.onShortcutsUpdated?.((updated) => {
      setBindings(updated as ShortcutMap)
    })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  return (
    <ShortcutContext.Provider value={{ bindings }}>
      {children}
    </ShortcutContext.Provider>
  )
}

export function useShortcutBindings() {
  return useContext(ShortcutContext)
}
