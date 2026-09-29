/**
 * InterviewAudioIpc.ts — 面试语音采集的 IPC 胶水层
 *
 * 把 AudioManager（主进程系统音频采集 + 断句）暴露给渲染进程（面试页面）：
 *   - 渲染进程 invoke 'interview-audio:start' / 'interview-audio:stop'
 *   - 主进程检测到一句话后，通过 'interview-audio:utterance' 事件推送给渲染进程
 *     （携带 base64 PCM，渲染进程再调后端 ASR 接口转文字、触发 AI 回答）
 *
 * 用法：在 main.ts 的 initializeIpcHandlers(...) 之后调用
 *       registerInterviewAudioIpc(getMainWindow)
 *       （传 getter 而非窗口引用，因为主窗口会被销毁重建）
 */

import { BrowserWindow, ipcMain } from 'electron'
import { AudioManager } from './AudioManager'

export function registerInterviewAudioIpc(
  getTargetWindow: () => BrowserWindow | null
): void {
  let audioManager: AudioManager | null = null

  const send = (channel: string, payload?: unknown) => {
    const win = getTargetWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }

  ipcMain.handle('interview-audio:start', async () => {
    try {
      if (!audioManager) {
        audioManager = new AudioManager(AudioManager.defaultBinaryPath())
        audioManager.on('ready', () => send('interview-audio:ready'))
        audioManager.on('error', (err: Error) => send('interview-audio:error', err.message))
        audioManager.on('stopped', (info: { code: number | null; signal: string | null }) =>
          send('interview-audio:stopped', info)
        )
        audioManager.on('utterance', (utterance: { pcm: Buffer; durationMs: number }) => {
          send('interview-audio:utterance', {
            audioBase64: utterance.pcm.toString('base64'),
            durationMs: utterance.durationMs,
          })
        })
      }
      await audioManager.start()
      return { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })

  ipcMain.handle('interview-audio:stop', async () => {
    try {
      if (audioManager) {
        await audioManager.stop()
        audioManager = null
      }
      return { success: true }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  })
}
