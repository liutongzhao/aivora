import type { Connection, UserModel } from '../../types/userConfig'
import type { ClientToastVariant } from '../ClientShell/ClientToast'

export interface ModelListProps {
  connections: Connection[]
  models: UserModel[]
  onRefresh?: () => Promise<void> | void
  onNotify?: (message: string, variant?: ClientToastVariant) => void
}
