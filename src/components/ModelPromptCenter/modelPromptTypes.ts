import type { Connection, UserModel } from '../../types/userConfig'

export interface ModelListProps {
  connections: Connection[]
  models: UserModel[]
  onRefresh?: () => Promise<void> | void
}
