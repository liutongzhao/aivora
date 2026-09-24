// config.ts - 配置文件读取工具
import configData from '../../config.json'

interface AppConfig {
  api: {
    baseUrl: string;
    aiEndpoint: string;
    webEndpoint: string;
  };
  websocket: {
    url: string;
  };
  web: {
    baseUrl: string;
    logoutPath: string;
    dashboardPath: string;
  };
  environment: string;
}

// 读取配置文件
export const config: AppConfig = configData

// 获取完整的AI API URL
export const getAIApiBaseUrl = (): string => {
  return `${config.api.baseUrl}${config.api.aiEndpoint}`
}

// 获取完整的Web API URL  
export const getWebApiBaseUrl = (): string => {
  return `${config.api.baseUrl}${config.api.webEndpoint}`
}

// 获取WebSocket URL
export const getWebSocketUrl = (): string => {
  return config.websocket.url
}

// 获取Web页面URL
export const getWebUrl = (path: string): string => {
  return `${config.web.baseUrl}${path}`
}

// 打印配置信息（调试用）
console.log('📋 加载配置文件:', {
  aiApiUrl: getAIApiBaseUrl(),
  webApiUrl: getWebApiBaseUrl(), 
  websocketUrl: getWebSocketUrl(),
  environment: config.environment
})