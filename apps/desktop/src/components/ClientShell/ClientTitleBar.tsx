import { Minus, Square, X } from 'lucide-react'
import appIcon from '../../../assets/icons/win/aivora.ico'

export function ClientTitleBar() {
  return (
    <header
      className="client-titlebar fixed inset-x-0 top-0 z-50 flex h-12 items-center justify-between px-4"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="client-brand">
        <img src={appIcon} alt="" width={22} height={22} />
        <span>Aivora</span>
      </div>
      <div className="client-window-controls" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          type="button"
          title="最小化"
          aria-label="最小化"
          onClick={() => window.electronAPI?.windowControl?.('minimize')}
        >
          <Minus size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          title="最大化或还原"
          aria-label="最大化或还原"
          onClick={() => window.electronAPI?.windowControl?.('toggle-maximize')}
        >
          <Square size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          title="关闭"
          aria-label="关闭"
          onClick={() => window.electronAPI?.windowControl?.('close')}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

export default ClientTitleBar
