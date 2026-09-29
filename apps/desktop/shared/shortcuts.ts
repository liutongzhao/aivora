export type ShortcutAction =
  | 'screenshot'
  | 'programming'
  | 'singleChoice'
  | 'singleChoiceAlt'
  | 'multipleChoice'
  | 'universal'
  | 'partialScreenshot'
  | 'reset'
  | 'toggleWindow'
  | 'openConfig'
  | 'moveWindowLeft'
  | 'moveWindowRight'
  | 'moveWindowUp'
  | 'moveWindowDown'
  | 'decreaseWindowHeight'
  | 'increaseWindowHeight'
  | 'decreaseWindowWidth'
  | 'increaseWindowWidth'
  | 'decreaseOpacity'
  | 'increaseOpacity'
  | 'decreaseOpacityAlt'
  | 'increaseOpacityAlt'
  | 'zoomOut'
  | 'zoomIn'
  | 'resetZoom'
  | 'toggleRawOutputView'
  | 'deleteLastScreenshot'
  | 'recoverWindow'
  | 'refreshConfig'
  | 'createRemotePairing'
  | 'copyCode'
  | 'scrollCodeLeft'
  | 'scrollCodeRight'
  | 'scrollCodeUp'
  | 'scrollCodeDown'

export interface ShortcutDefinition {
  action: ShortcutAction
  label: string
  description: string
  category: 'capture' | 'process' | 'system' | 'window' | 'view' | 'scroll' | 'utility'
}

export const shortcutDefinitions: ShortcutDefinition[] = [
  {
    action: 'screenshot',
    label: '截图',
    description: '将当前屏幕截图添加到队列',
    category: 'capture'
  },
  {
    action: 'partialScreenshot',
    label: '局部截图',
    description: '通过拖拽选择题目区域',
    category: 'capture'
  },
  {
    action: 'programming',
    label: '搜编程题',
    description: '对当前队列进行编程题识别',
    category: 'process'
  },
  {
    action: 'singleChoice',
    label: '搜单选题',
    description: '识别最新队列中的单选题',
    category: 'process'
  },
  {
    action: 'singleChoiceAlt',
    label: '搜单选题（备用）',
    description: '备用快捷键，和主键位功能相同',
    category: 'process'
  },
  {
    action: 'multipleChoice',
    label: '搜多选题',
    description: '识别多选题并返回答案',
    category: 'process'
  },
  {
    action: 'universal',
    label: '通用搜题',
    description: '自动识别题型并作答',
    category: 'process'
  },
  {
    action: 'reset',
    label: '一键重置',
    description: '清空队列并取消所有请求',
    category: 'system'
  },
  {
    action: 'toggleWindow',
    label: '显示/隐藏考试窗口',
    description: '在桌面显示或隐藏黑色客户端',
    category: 'system'
  },
  {
    action: 'openConfig',
    label: '返回配置页',
    description: '关闭考试小窗并返回账户与设置页面',
    category: 'system'
  },
  {
    action: 'moveWindowLeft',
    label: '窗口左移',
    description: '将黑色考试窗口向左移动一小段距离',
    category: 'window'
  },
  {
    action: 'moveWindowRight',
    label: '窗口右移',
    description: '将黑色考试窗口向右移动一小段距离',
    category: 'window'
  },
  {
    action: 'moveWindowUp',
    label: '窗口上移',
    description: '将黑色考试窗口向上移动一小段距离',
    category: 'window'
  },
  {
    action: 'moveWindowDown',
    label: '窗口下移',
    description: '将黑色考试窗口向下移动一小段距离',
    category: 'window'
  },
  {
    action: 'decreaseWindowHeight',
    label: '减小窗口高度',
    description: '让黑色窗口在垂直方向变矮',
    category: 'window'
  },
  {
    action: 'increaseWindowHeight',
    label: '增大窗口高度',
    description: '让黑色窗口在垂直方向变高',
    category: 'window'
  },
  {
    action: 'decreaseWindowWidth',
    label: '减小窗口宽度',
    description: '让黑色窗口在水平方向变窄',
    category: 'window'
  },
  {
    action: 'increaseWindowWidth',
    label: '增大窗口宽度',
    description: '让黑色窗口在水平方向变宽',
    category: 'window'
  },
  {
    action: 'decreaseOpacity',
    label: '降低背景透明度',
    description: '降低黑色考试窗口的透明度',
    category: 'window'
  },
  {
    action: 'increaseOpacity',
    label: '提高背景透明度',
    description: '提高黑色考试窗口的透明度',
    category: 'window'
  },
  {
    action: 'decreaseOpacityAlt',
    label: '降低透明度（备用）',
    description: '备用按键，效果与降低背景透明度相同',
    category: 'window'
  },
  {
    action: 'increaseOpacityAlt',
    label: '提高透明度（备用）',
    description: '备用按键，效果与提高背景透明度相同',
    category: 'window'
  },
  {
    action: 'zoomOut',
    label: '缩小考试窗口内容',
    description: '缩小界面显示比例',
    category: 'view'
  },
  {
    action: 'resetZoom',
    label: '重置显示比例',
    description: '恢复界面到默认缩放',
    category: 'view'
  },
  {
    action: 'zoomIn',
    label: '放大考试窗口内容',
    description: '放大界面显示比例',
    category: 'view'
  },
  {
    action: 'toggleRawOutputView',
    label: '查看原始输出',
    description: '在解决方案与原始输出之间快速切换',
    category: 'view'
  },
  {
    action: 'deleteLastScreenshot',
    label: '删除最后一张截图',
    description: '从队列中移除最新的截图',
    category: 'system'
  },
  {
    action: 'recoverWindow',
    label: '恢复窗口位置',
    description: '将黑色窗口重置到屏幕中央',
    category: 'window'
  },
  {
    action: 'refreshConfig',
    label: '刷新账号配置',
    description: '立即同步远程用户配置',
    category: 'utility'
  },
  {
    action: 'createRemotePairing',
    label: '生成手机连接码',
    description: '生成手机远程控制连接码',
    category: 'utility'
  },
  {
    action: 'copyCode',
    label: '复制代码',
    description: '直接复制当前解决方案代码',
    category: 'utility'
  },
  {
    action: 'scrollCodeLeft',
    label: '代码左移',
    description: '水平滚动解决方案代码（向左）',
    category: 'scroll'
  },
  {
    action: 'scrollCodeRight',
    label: '代码右移',
    description: '水平滚动解决方案代码（向右）',
    category: 'scroll'
  },
  {
    action: 'scrollCodeUp',
    label: '代码上移',
    description: '垂直滚动解决方案代码（向上）',
    category: 'scroll'
  },
  {
    action: 'scrollCodeDown',
    label: '代码下移',
    description: '垂直滚动解决方案代码（向下）',
    category: 'scroll'
  }
]

export const defaultShortcutBindings: Record<ShortcutAction, string> = {
  screenshot: 'CommandOrControl+Shift+H',
  partialScreenshot: 'CommandOrControl+Shift+S',
  programming: 'CommandOrControl+Enter',
  singleChoice: 'CommandOrControl+Shift+M',
  singleChoiceAlt: 'CommandOrControl+Shift+,',
  multipleChoice: 'CommandOrControl+Shift+Enter',
  universal: 'CommandOrControl+.',
  reset: 'CommandOrControl+R',
  toggleWindow: 'CommandOrControl+B',
  openConfig: 'CommandOrControl+Shift+P',
  moveWindowLeft: 'CommandOrControl+Left',
  moveWindowRight: 'CommandOrControl+Right',
  moveWindowUp: 'CommandOrControl+Up',
  moveWindowDown: 'CommandOrControl+Down',
  decreaseWindowWidth: 'CommandOrControl+Shift+3',
  increaseWindowWidth: 'CommandOrControl+Shift+4',
  decreaseOpacity: 'CommandOrControl+[',
  increaseOpacity: 'CommandOrControl+]',
  decreaseOpacityAlt: 'CommandOrControl+Shift+1',
  increaseOpacityAlt: 'CommandOrControl+Shift+2',
  zoomOut: 'CommandOrControl+-',
  resetZoom: 'CommandOrControl+0',
  zoomIn: 'CommandOrControl+=',
  toggleRawOutputView: 'CommandOrControl+L',
  deleteLastScreenshot: 'CommandOrControl+D',
  recoverWindow: 'CommandOrControl+Shift+R',
  refreshConfig: 'CommandOrControl+Shift+C',
  createRemotePairing: 'CommandOrControl+Alt+H',
  copyCode: 'CommandOrControl+J',
  scrollCodeLeft: 'CommandOrControl+Shift+Left',
  scrollCodeRight: 'CommandOrControl+Shift+Right',
  scrollCodeUp: 'CommandOrControl+Shift+Up',
  scrollCodeDown: 'CommandOrControl+Shift+Down',
  decreaseWindowHeight: 'CommandOrControl+Shift+5',
  increaseWindowHeight: 'CommandOrControl+Shift+6'
}

export function getMissingShortcutActions(
  bindings: Record<ShortcutAction, string>,
  isRegistered: (accelerator: string) => boolean,
): ShortcutAction[] {
  return (Object.keys(bindings) as ShortcutAction[]).filter((action) => {
    const accelerator = bindings[action]
    return Boolean(accelerator) && !accelerator.includes('MouseButton4') && !accelerator.includes('MouseButton5') && !isRegistered(accelerator)
  })
}

export function mergeShortcutBindings(
  custom?: Partial<Record<ShortcutAction, string>>
): Record<ShortcutAction, string> {
  return {
    ...defaultShortcutBindings,
    ...(custom || {})
  }
}
