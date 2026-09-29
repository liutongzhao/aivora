// 轻量化语言配置Hook - 后端现在管理所有配置
interface LanguageConfig {
  language: string
  loading: boolean
  error: string | null
  refetch: () => void
}

export const useLanguageConfig = (): LanguageConfig => {
  // 简化为只返回默认值，后端会处理实际的语言配置
  return {
    language: 'python', // 默认语言
    loading: false,     // 不再需要加载
    error: null,        // 不再需要错误处理
    refetch: () => {}   // 空函数，兼容现有代码
  }
}