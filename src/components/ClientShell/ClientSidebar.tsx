import { Keyboard, LayoutDashboard, MonitorCog } from 'lucide-react'

export type ClientSection = 'overview' | 'shortcuts' | 'system'

interface ClientSidebarProps {
  activeSection: ClientSection
  onSelect: (section: ClientSection) => void
}

const navigationItems: Array<{
  section: ClientSection
  label: string
  icon: typeof LayoutDashboard
}> = [
  { section: 'overview', label: '概览', icon: LayoutDashboard },
  { section: 'shortcuts', label: '快捷键', icon: Keyboard },
  { section: 'system', label: '外观与系统', icon: MonitorCog }
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
