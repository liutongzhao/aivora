import { useEffect, useState } from 'react'

export function WindowSettings() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [opacity, setOpacityValue] = useState(1)

  useEffect(() => {
    Promise.all([
      window.electronAPI?.getClientTheme?.(),
      window.electronAPI?.getOpacity?.(),
    ]).then(([themeResult, opacityResult]) => {
      if (themeResult?.theme === 'light' || themeResult?.theme === 'dark') setTheme(themeResult.theme)
      if (typeof opacityResult?.opacity === 'number') setOpacityValue(opacityResult.opacity)
    })
  }, [])

  async function chooseTheme(nextTheme: 'dark' | 'light') {
    await window.electronAPI?.setClientTheme?.(nextTheme)
    setTheme(nextTheme)
  }

  async function updateOpacity(value: number) {
    setOpacityValue(value)
    await window.electronAPI?.setOpacity?.(value)
  }

  return (
    <section className="window-settings-panel">
      <h2>窗口显示</h2>
      <div className="window-setting-row">
        <div><strong>主题</strong><span>考试窗口的显示主题</span></div>
        <div className="window-theme-buttons">
          <button type="button" className={theme === 'dark' ? 'is-active' : ''} onClick={() => void chooseTheme('dark')}>深色</button>
          <button type="button" className={theme === 'light' ? 'is-active' : ''} onClick={() => void chooseTheme('light')}>浅色</button>
        </div>
      </div>
      <div className="window-setting-row">
        <div><strong>透明度</strong><span>调整考试窗口背景透明度</span></div>
        <label className="window-opacity-control">
          <span>{Math.round(opacity * 100)}%</span>
          <input aria-label="窗口透明度" type="range" min="0.4" max="1" step="0.05" value={opacity} onChange={(event) => void updateOpacity(Number(event.target.value))} />
        </label>
      </div>
      <div className="window-setting-row">
        <div><strong>窗口位置</strong><span>恢复考试窗口默认位置</span></div>
        <button type="button" className="client-button client-button-secondary" onClick={() => window.electronAPI?.windowControl?.('toggle-maximize')}>恢复位置</button>
      </div>
    </section>
  )
}
