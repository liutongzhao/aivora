import type { Connection, UserModel, TrialModelInfo } from '../../types/userConfig'
import type { ClientToastVariant } from '../ClientShell/ClientToast'

export interface ModelListProps {
  connections: Connection[]
  models: UserModel[]
  trialModel?: TrialModelInfo | null
  onRefresh?: () => Promise<void> | void
  onNotify?: (message: string, variant?: ClientToastVariant) => void
}
