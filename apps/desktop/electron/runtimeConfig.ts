import path from 'node:path'
import type { DesktopConfig } from '../shared/configTypes'

const configData = process.env.NODE_ENV === 'development'
  ? require(path.join(__dirname, '../../config.local.json'))
  : require(path.join(__dirname, '../../config.json'))

export default configData as DesktopConfig
