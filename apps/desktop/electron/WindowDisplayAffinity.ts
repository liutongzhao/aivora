/**
 * WindowDisplayAffinity.ts — Windows 窗口防捕获（WDA_EXCLUDEFROMCAPTURE）
 *
 * 补齐 TechScreen 方案在 Windows 端的 OS 合成器层过滤：
 *   macOS 用 setContentProtection(true)（对应 NSWindowSharingNone，已在 PerformantAntiCapture 中）
 *   Windows 用 SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)，让窗口不出现在任何捕获帧流里。
 *
 * Electron 未暴露该 API，需通过 ffi-napi 调 user32.dll（或等价的 native addon）。
 */

import { BrowserWindow } from 'electron'

// WDA_EXCLUDEFROMCAPTURE = 0x00000011
const WDA_EXCLUDEFROMCAPTURE = 0x00000011

/**
 * 对指定窗口应用 Windows 防捕获。
 * 依赖 ffi-napi：npm i ffi-napi（或使用等价 native addon）。
 * 失败不抛异常，仅告警，保证不阻塞主流程。
 */
export function applyWindowDisplayAffinity(win: BrowserWindow): void {
  if (process.platform !== 'win32') return

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffi = require('ffi-napi')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ref = require('ref-napi')

    const user32 = ffi.Library('user32', {
      SetWindowDisplayAffinity: ['bool', ['void*', 'uint32']],
    })

    const hwnd = win.getNativeWindowHandle()
    const hwndPtr = ref.alloc('void*', hwnd) // 兼容 ref-napi 的指针封装

    const ok = user32.SetWindowDisplayAffinity(hwndPtr, WDA_EXCLUDEFROMCAPTURE)
    if (!ok) {
      console.warn('⚠️ [AntiCapture] SetWindowDisplayAffinity 返回 false')
    } else {
      console.log('✅ [AntiCapture] Windows WDA_EXCLUDEFROMCAPTURE 已启用')
    }
  } catch (error) {
    console.warn(
      '⚠️ [AntiCapture] Windows 防捕获失败（可能缺 ffi-napi/ref-napi 依赖）:',
      (error as Error).message
    )
  }
}

/**
 * 关闭 Windows 防捕获（正常捕获窗口内容，用于截图等场景）
 */
export function clearWindowDisplayAffinity(win: BrowserWindow): void {
  if (process.platform !== 'win32') return

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffi = require('ffi-napi')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ref = require('ref-napi')

    const user32 = ffi.Library('user32', {
      SetWindowDisplayAffinity: ['bool', ['void*', 'uint32']],
    })
    const hwndPtr = ref.alloc('void*', win.getNativeWindowHandle())
    // WDA_NONE = 0x00000000，恢复默认
    user32.SetWindowDisplayAffinity(hwndPtr, 0x00000000)
  } catch (error) {
    console.warn('⚠️ [AntiCapture] 恢复 Windows 显示亲和性失败:', (error as Error).message)
  }
}
