/**
 * AudioManager.ts — Electron 主进程系统音频采集 + 断句（VAD）
 *
 * 面试模式的核心音频链路：
 *   系统扬声器(面试官声音) → ScreenCaptureKit(Swift) → PCM stdout
 *     → 能量检测断句(VAD) → 每句话切出 → 交给上层转写(ASR)
 *
 * 仅 macOS（ScreenCaptureKit）。Windows 留 TODO（WASAPI loopback，参考 WingMan）。
 */

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import * as path from 'path'
import * as fs from 'fs'

const SAMPLE_RATE = 16000
const BYTES_PER_SAMPLE = 2 // Int16
const CHUNK_MS = 20 // 每帧 20ms
const FRAME_SIZE = Math.floor((SAMPLE_RATE * CHUNK_MS) / 1000) // 320 samples
const FRAME_BYTES = FRAME_SIZE * BYTES_PER_SAMPLE

// 断句参数
const SILENCE_THRESHOLD_RMS = 300 // 低于此视为静音（Int16 RMS）
const MAX_UTTERANCE_MS = 15000 // 单句最长 15s，强制切分
const MIN_UTTERANCE_MS = 300 // 短于 300ms 丢弃（噪声）

export interface Utterance {
  pcm: Buffer
  durationMs: number
}

export class AudioManager extends EventEmitter {
  private proc: ChildProcess | null = null
  private running = false
  private stdoutBuffer: Buffer = Buffer.alloc(0)
  private currentUtterance: Buffer[] = []
  private currentUtteranceBytes = 0
  private silenceMs = 0
  private hasSpeech = false

  constructor(private readonly binaryPath: string) {
    super()
  }

  /**
   * 启动系统音频采集（macOS：拉起 Swift ScreenCaptureKit 助手）
   */
  async start(): Promise<void> {
    if (this.running) return
    if (process.platform !== 'darwin') {
      throw new Error('AudioManager 目前仅支持 macOS（ScreenCaptureKit）。Windows WASAPI 待接入。')
    }
    if (!fs.existsSync(this.binaryPath)) {
      throw new Error(`系统音频采集助手不存在: ${this.binaryPath}，请先编译 SystemAudioCapture.swift`)
    }

    this.reset()

    this.proc = spawn(this.binaryPath, [], { stdio: ['ignore', 'pipe', 'pipe'] })
    this.running = true

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.handlePcmChunk(chunk)
    })

    this.proc.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      if (text.includes('SYSTEM_AUDIO_READY')) {
        this.emit('ready')
      } else if (text.includes('SYSTEM_AUDIO_ERROR')) {
        this.emit('error', new Error(text.trim()))
      }
      // 其余 stderr 仅打日志
      console.log('[AudioManager]', text.trim())
    })

    this.proc.on('exit', (code, signal) => {
      this.running = false
      this.emit('stopped', { code, signal })
    })

    this.proc.on('error', (err) => {
      this.running = false
      this.emit('error', err)
    })
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.proc) {
      this.proc.kill('SIGTERM')
      this.proc = null
    }
    // 如果还有未完成的句子，收尾
    this.flushUtterance()
  }

  private reset() {
    this.stdoutBuffer = Buffer.alloc(0)
    this.currentUtterance = []
    this.currentUtteranceBytes = 0
    this.silenceMs = 0
    this.hasSpeech = false
  }

  /**
   * 处理从 Swift 助手 stdout 流出的 PCM 数据。
   * 按 20ms 帧切分，逐帧做能量检测，累计静音时长实现断句。
   */
  private handlePcmChunk(chunk: Buffer) {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk])

    while (this.stdoutBuffer.length >= FRAME_BYTES) {
      const frame = this.stdoutBuffer.subarray(0, FRAME_BYTES)
      this.stdoutBuffer = this.stdoutBuffer.subarray(FRAME_BYTES)
      this.processFrame(frame)
    }
  }

  private processFrame(frame: Buffer) {
    const rms = this.computeRms(frame)
    const isSpeech = rms >= SILENCE_THRESHOLD_RMS

    if (isSpeech) {
      this.hasSpeech = true
      this.silenceMs = 0
      this.currentUtterance.push(frame)
      this.currentUtteranceBytes += frame.length
    } else if (this.hasSpeech) {
      // 静音帧：继续保留（避免把语尾吞掉），累计静音时长
      this.currentUtterance.push(frame)
      this.currentUtteranceBytes += frame.length
      this.silenceMs += CHUNK_MS

      if (this.silenceMs >= 800) {
        // 静音 800ms 视为一句话结束
        this.flushUtterance()
      }
    }
    // 若还没出现过语音，静音帧直接丢弃

    // 超过最大时长强制切分
    if (this.hasSpeech && this.currentUtteranceBytes / (BYTES_PER_SAMPLE * SAMPLE_RATE) * 1000 >= MAX_UTTERANCE_MS) {
      this.flushUtterance()
    }
  }

  private flushUtterance() {
    if (!this.hasSpeech || this.currentUtteranceBytes === 0) {
      this.resetUtterance()
      return
    }

    const pcm = Buffer.concat(this.currentUtterance)
    const durationMs = Math.round((pcm.length / (BYTES_PER_SAMPLE * SAMPLE_RATE)) * 1000)

    if (durationMs >= MIN_UTTERANCE_MS) {
      const utterance: Utterance = { pcm, durationMs }
      this.emit('utterance', utterance)
    }

    this.resetUtterance()
  }

  private resetUtterance() {
    this.currentUtterance = []
    this.currentUtteranceBytes = 0
    this.silenceMs = 0
    this.hasSpeech = false
  }

  /**
   * 计算 Int16 PCM 帧的 RMS 能量
   */
  private computeRms(frame: Buffer): number {
    let sum = 0
    for (let i = 0; i + 1 < frame.length; i += 2) {
      const sample = frame.readInt16LE(i)
      sum += sample * sample
    }
    const count = frame.length / 2
    return count === 0 ? 0 : Math.sqrt(sum / count)
  }

  /**
   * 便捷：解析采集助手二进制路径。
   * 开发模式下 dist-electron 可能是打包版（根 main.js）或 tsc 输出（electron/ 子目录），
   * 因此按候选路径探测，取第一个存在的。
   */
  static defaultBinaryPath(): string {
    const binaryName = 'SystemAudioCapture'
    const candidates = [
      // tsc 输出结构：<root>/dist-electron/electron/ → 上两级到根 → electron/native/...
      path.join(__dirname, '..', '..', 'electron', 'native', 'SystemAudioCapture', binaryName),
      // 打包结构：<root>/dist-electron/ → 上一级到根 → electron/native/...
      path.join(__dirname, '..', 'electron', 'native', 'SystemAudioCapture', binaryName),
      // electron-builder extraResources（打包后）
      path.join(process.resourcesPath || '', 'native', binaryName),
    ]
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p
      } catch {
        // ignore
      }
    }
    return candidates[0]
  }
}
