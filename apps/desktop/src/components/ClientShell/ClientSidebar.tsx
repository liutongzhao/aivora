import {
  Cable,
  Keyboard,
  Monitor,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react'

export type ClientSection =
  | 'shortcuts'
  | 'models'
  | 'window'
  | 'connection'
  | 'account'

interface ClientSidebarProps {
  activeSection: ClientSection
  onSelect: (section: ClientSection) => void
}

const navigationItems: Array<{
  section: ClientSection
  label: string
  icon: typeof Keyboard
}> = [
  { section: 'models', label: '模型配置', icon: SlidersHorizontal },
  { section: 'shortcuts', label: '快捷键', icon: Keyboard },
  { section: 'window', label: '窗口显示', icon: Monitor },
  { section: 'connection', label: '服务连接', icon: Cable },
  { section: 'account', label: '账户', icon: UserRound },
]

export function ClientSidebar({ activeSection, onSelect }: ClientSidebarProps) {
  return (
    <aside className="client-sidebar" aria-label="设置导航">
      <nav aria-label="设置导航">
        {navigationItems.map(({ section, label, icon: Icon }) => (
          <button
            key={section}
            type="button"
            className={`client-sidebar-item ${activeSection === section ? 'is-active' : ''}`}
            aria-current={activeSection === section ? 'page' : undefined}
            onClick={() => onSelect(section)}
          >
            <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default ClientSidebar
