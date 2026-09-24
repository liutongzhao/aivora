//  SystemAudioCapture.swift
//
//  macOS 系统音频采集助手（ScreenCaptureKit）
//
//  用途：被 Electron 主进程拉起，捕获系统扬声器输出（面试官声音），
//        转成 16kHz / 单声道 / Int16 PCM 写入 stdout。
//
//  要求：macOS 13+，Xcode 15+。
//  构建：swiftc -O -o SystemAudioCapture SystemAudioCapture.swift
//
//  首次运行需要授予「屏幕录制」权限（系统设置 → 隐私与安全性 → 屏幕录制）。
//  与 WingMan 的 BlackHole 虚拟声卡方案不同，本方案直接用 ScreenCaptureKit，
//  免装虚拟声卡。

import Foundation
import ScreenCaptureKit
import CoreMedia
import AVFoundation

@main
final class SystemAudioCapture: NSObject, SCStreamOutput {

    private var stream: SCStream?
    private let stdout = FileHandle.standardOutput
    private let stderr = FileHandle.standardError
    private let targetSampleRate: Double = 16000
    private var converter: AVAudioConverter?
    private var converterInitialized = false

    // MARK: - 入口

    static func main() async {
        let capture = SystemAudioCapture()
        do {
            try await capture.run()
        } catch {
            FileHandle.standardError.write(Data("SYSTEM_AUDIO_ERROR: \(error)\n".utf8))
            exit(1)
        }
    }

    // MARK: - 采集生命周期

    func run() async throws {
        // 1. 触发屏幕录制权限请求（ScreenCaptureKit 需要）
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)

        guard let display = content.displays.first else {
            stderr.write(Data("SYSTEM_AUDIO_ERROR: no display available\n".utf8))
            throw NSError(domain: "SystemAudioCapture", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "没有可用显示器"])
        }

        // 2. 配置：只采集音频
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.capturesVideo = false
        config.sampleRate = Int(targetSampleRate)
        config.channelCount = 1
        config.showsCursor = false

        // 3. 用主显示器构造内容过滤器（音频捕获仍需要一个 filter 上下文）
        let filter = SCContentFilter(display: display, excludingWindows: [])

        // 4. 创建 stream 并注册音频输出回调
        let stream = SCStream(filter: filter, configuration: config, delegate: nil)
        try stream.addStreamOutput(self, type: .audio,
                                   sampleHandlerQueue: DispatchQueue.global(qos: .userInitiated))
        try await stream.startCapture()
        self.stream = stream

        stderr.write(Data("SYSTEM_AUDIO_READY\n".utf8))

        // 5. 保持运行，直到收到 SIGTERM（Electron 主进程 kill 时退出）
        try await Task.sleep(nanoseconds: .max)
    }

    // MARK: - SCStreamOutput

    func stream(_ stream: SCStream,
                didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
                of outputType: SCStreamOutputType) {
        guard outputType == .audio else { return }
        guard let pcm = extractPCM(from: sampleBuffer) else { return }
        stdout.write(pcm)
    }

    // MARK: - 音频转换

    /// 将 CMSampleBuffer 的音频抽取为 16kHz 单声道 Int16 PCM。
    private func extractPCM(from sampleBuffer: CMSampleBuffer) -> Data? {
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer) else { return nil }
        let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription)?.pointee

        // 取原始音频缓冲区列表
        var audioBufferList = AudioBufferList()
        var blockBuffer: CMBlockBuffer?
        let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: nil,
            bufferListOut: &audioBufferList,
            bufferListSize: MemoryLayout<AudioBufferList>.size,
            blockBufferAllocator: nil,
            blockBufferMemoryAllocator: nil,
            flags: kCMSampleBufferFlag_AudioBufferList_AssureSizeIsBufferSize,
            blockBufferOut: &blockBuffer
        )
        guard status == noErr else { return nil }

        let sourceFormat = asbd.map {
            AVAudioFormat(commonFormat: .pcmFormatFloat32,
                          sampleRate: $0.mSampleRate,
                          channels: AVAudioChannelCount($0.mChannelsPerFrame),
                          interleaved: false)
        } ?? AVAudioFormat(standardFormatWithSampleRate: targetSampleRate, channels: 1)

        guard let targetFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: targetSampleRate,
            channels: 1,
            interleaved: false
        ) else { return nil }

        // 懒初始化 AVAudioConverter（float32 -> int16, 重采样到 16kHz）
        if !converterInitialized {
            converter = AVAudioConverter(from: sourceFormat, to: targetFormat)
            converterInitialized = true
        }
        guard let converter = converter else { return nil }

        let frameCount = AVAudioFrameCount(CMSampleBufferGetNumSamples(sampleBuffer))
        guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: frameCount) else { return nil }
        pcmBuffer.frameLength = 0

        // 把 AudioBufferList 包成 AVAudioPCMBuffer 喂给 converter
        let inputBuffer = AVAudioPCMBuffer(pcmFormat: sourceFormat, frameCapacity: frameCount)!
        inputBuffer.frameLength = frameCount
        let inputList = UnsafeMutableAudioBufferListPointer(&audioBufferList)
        for i in 0..<min(Int(inputList.count), Int(inputBuffer.audioBufferList.pointee.mNumberBuffers)) {
            let src = inputList[i]
            let dst = inputBuffer.audioBufferList[i]
            memcpy(dst.mData, src.mData, Int(src.mDataByteSize))
            dst.mDataByteSize = src.mDataByteSize
        }

        var error: NSError?
        var inputConsumed = false
        let outputStatus = converter.convert(to: pcmBuffer, error: &error) { _, outStatus in
            // 输入只喂一次；再次请求时声明流结束，避免重复消费同一块 buffer
            if inputConsumed {
                outStatus.pointee = .endOfStream
                return nil
            }
            inputConsumed = true
            outStatus.pointee = .haveData
            return inputBuffer
        }
        _ = consumed
        guard outputStatus == .haveData || outputStatus == .endOfStream, error == nil else { return nil }

        // 将 Int16 PCM 拷贝为 Data
        guard let channelData = pcmBuffer.int16ChannelData?[0], pcmBuffer.frameLength > 0 else { return nil }
        let bytes = UnsafeBufferPointer(start: channelData, count: Int(pcmBuffer.frameLength))
        return Data(buffer: bytes)
    }
}
