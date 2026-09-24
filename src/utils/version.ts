// version.ts - 客户端版本信息管理
import packageJson from '../../package.json'

const detectPlatform = (): string => {
  if (typeof window !== 'undefined') {
    try {
      const platform = window.electronAPI?.getPlatform?.()
      if (platform) {
        return platform
      }
      const ua = navigator?.userAgent || ''
      if (ua.includes('Mac')) return 'darwin'
      if (ua.includes('Win')) return 'win32'
      if (ua.includes('Linux')) return 'linux'
    } catch (error) {
      console.warn('Failed to detect platform from window context:', error)
    }
  }

  if (typeof process !== 'undefined' && process.platform) {
    return process.platform
  }

  return 'unknown'
}

/**
 * 获取客户端版本信息
 */
export const getClientVersion = () => {
  return {
    version: packageJson.version,
    name: packageJson.name,
    type: 'electron' as const
  }
}

/**
 * 获取版本请求头
 */
export const getVersionHeaders = () => {
  const { version, type } = getClientVersion()
  return {
    'X-Client-Version': version,
    'X-Client-Type': type,
    'X-Client-Name': packageJson.name,
    'X-Client-Platform': detectPlatform()
  }
}

/**
 * 版本比较函数
 * @param v1 版本1
 * @param v2 版本2  
 * @returns -1: v1 < v2, 0: v1 = v2, 1: v1 > v2
 */
export const compareVersions = (v1: string, v2: string): number => {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0
    const part2 = parts2[i] || 0
    if (part1 < part2) return -1
    if (part1 > part2) return 1
  }
  return 0
}

/**
 * 检查是否需要更新
 * @param currentVersion 当前版本
 * @param latestVersion 最新版本
 * @returns 是否需要更新
 */
export const needsUpdate = (currentVersion: string, latestVersion: string): boolean => {
  return compareVersions(currentVersion, latestVersion) < 0
}
