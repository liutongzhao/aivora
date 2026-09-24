// ConfigHelper.ts - 简化版本（仅用于本地存储）
import fs from "node:fs"
import path from "node:path"
import { app } from "electron"
import { EventEmitter } from "events"
import {
  defaultShortcutBindings,
  mergeShortcutBindings,
  ShortcutAction
} from "../shared/shortcuts"

interface Config {
  // 简化配置：只保留本地存储需要的字段
  authToken?: string | null; // 认证token
  clientSettings?: {
    // 客户端特定设置
    windowPosition?: { x: number; y: number };
    windowSize?: { width: number; height: number };
    windowWidth?: number; // 🆕 窗口宽度
    windowHeight?: number; // 🆕 窗口高度
    lastLanguage?: string; // 最后使用的语言
    opacity?: number; // 窗口透明度（已废弃，保留兼容性）
    backgroundOpacity?: number; // 🆕 背景透明度（代替窗口透明度）
    theme?: 'dark' | 'light';
    remoteDeviceId?: string;
  }
  shortcutBindings?: Partial<Record<ShortcutAction, string>>
}

export class ConfigHelper extends EventEmitter {
  private configPath: string;
  private cache: Config | null = null;
  private defaultConfig: Config = {
    authToken: null,
    clientSettings: {
      windowPosition: undefined,
      windowSize: undefined,
      windowHeight: undefined,
      lastLanguage: 'python',
      theme: 'dark'
    },
    shortcutBindings: { ...defaultShortcutBindings }
  };

  constructor() {
    super();
    // Use the app's user data directory to store the config
    try {
      this.configPath = path.join(app.getPath('userData'), 'config.json');
      console.log('Config path:', this.configPath);
    } catch (err) {
      console.warn('Could not access user data path, using fallback');
      this.configPath = path.join(process.cwd(), 'config.json');
    }
    
    // Ensure the initial config file exists
    this.ensureConfigExists();
  }

  /**
   * Ensure config file exists
   */
  private ensureConfigExists(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.saveConfig(this.defaultConfig);
      }
    } catch (error) {
      console.error('Error ensuring config exists:', error);
    }
  }

  private readConfigFromDisk(): Config {
    const configData = fs.readFileSync(this.configPath, 'utf8');
    const config = JSON.parse(configData);
    return {
      ...this.defaultConfig,
      ...config
    };
  }

  /**
   * 加载配置（简化版）
   */
  public loadConfig(): Config {
    try {
      if (this.cache) {
        return this.cache;
      }

      if (fs.existsSync(this.configPath)) {
        this.cache = this.readConfigFromDisk();
        return this.cache;
      }

      this.saveConfig(this.defaultConfig);
      this.cache = this.defaultConfig;
      return this.defaultConfig;
    } catch (err) {
      console.error("Error loading config:", err);
      return this.cache || this.defaultConfig;
    }
  }

  /**
   * 保存配置
   */
  public saveConfig(config: Config): void {
    this.cache = {
      ...this.defaultConfig,
      ...config
    };

    fs.promises.writeFile(this.configPath, JSON.stringify(this.cache, null, 2))
      .then(() => console.log('Config saved successfully'))
      .catch((error) => console.error('Error saving config:', error));
  }

  /**
   * 更新配置
   */
  public updateConfig(updates: Partial<Config>): Config {
    try {
      const currentConfig = this.loadConfig();
      const newConfig = { ...currentConfig, ...updates };
      this.saveConfig(newConfig);
      this.emit('config-updated', newConfig);
      return newConfig;
    } catch (error) {
      console.error('Error updating config:', error);
      return this.cache || this.defaultConfig;
    }
  }

  /**
   * 获取认证token
   */
  public getAuthToken(): string | null {
    const config = this.loadConfig();
    return config.authToken || null;
  }

  /**
   * 设置认证token
   */
  public setAuthToken(token: string | null): void {
    this.updateConfig({ authToken: token });
  }

  /**
   * 获取客户端设置
   */
  public getClientSettings(): any {
    const config = this.loadConfig();
    return config.clientSettings || {};
  }

  /**
   * 更新客户端设置
   */
  public updateClientSettings(settings: any): void {
    const config = this.loadConfig();
    this.updateConfig({
      clientSettings: {
        ...config.clientSettings,
        ...settings
      }
    });
  }

  public getShortcutBindings(): Record<ShortcutAction, string> {
    const config = this.loadConfig()
    return mergeShortcutBindings(config.shortcutBindings)
  }

  public updateShortcutBinding(action: ShortcutAction, accelerator: string): Record<ShortcutAction, string> {
    const config = this.loadConfig()
    const nextBindings: Partial<Record<ShortcutAction, string>> = {
      ...(config.shortcutBindings || {}),
      [action]: accelerator
    }
    this.updateConfig({ shortcutBindings: nextBindings })
    return mergeShortcutBindings(nextBindings)
  }

  public updateShortcutBindings(bindings: Partial<Record<ShortcutAction, string>>): Record<ShortcutAction, string> {
    const config = this.loadConfig()
    const nextBindings: Partial<Record<ShortcutAction, string>> = {
      ...(config.shortcutBindings || {}),
      ...bindings
    }
    this.updateConfig({ shortcutBindings: nextBindings })
    return mergeShortcutBindings(nextBindings)
  }
}

// Export a singleton instance
export const configHelper = new ConfigHelper();
