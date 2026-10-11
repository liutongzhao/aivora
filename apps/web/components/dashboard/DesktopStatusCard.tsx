"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, MonitorDown } from "lucide-react";
import { getDesktopDownload, getDesktopPlatform, macSecurityCommand, type DesktopPlatform } from "../../lib/desktop-download";

export function DesktopStatusCard() {
  const [platform, setPlatform] = useState<DesktopPlatform>("unknown");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPlatform(getDesktopPlatform(window.navigator.userAgent));
  }, []);

  const detectedDownload = getDesktopDownload(platform);
  const copyCommand = async () => {
    await navigator.clipboard?.writeText(macSecurityCommand);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return <section className="desktop-status-card" aria-labelledby="desktop-download-title">
    <div className="desktop-status-card-heading">
      <div>
        <h3 id="desktop-download-title">下载桌面客户端</h3>
      </div>
      <MonitorDown size={22} aria-hidden="true" />
    </div>
    <p>安装后使用快捷键截图，AI 任务会自动同步到当前工作台。</p>
    <div className="desktop-download-actions">
      {detectedDownload ? (
        <a className="button" href={detectedDownload.href} download>
          <Download size={15} aria-hidden="true" />{detectedDownload.label}
        </a>
      ) : (
        <>
          <a className="button" href={getDesktopDownload("mac")!.href} download>
            <Download size={15} aria-hidden="true" />下载 macOS 版
          </a>
          <a className="button secondary" href={getDesktopDownload("windows")!.href} download>
            <Download size={15} aria-hidden="true" />下载 Windows 版
          </a>
        </>
      )}
    </div>
    {(platform === "mac" || platform === "unknown") && <div className="mac-install-note">
      <strong>macOS 首次打开</strong>
      <span>如果提示无法验证开发者，将 Aivora 拖入“应用程序”后，在终端执行：</span>
      <code>{macSecurityCommand}</code>
      <button type="button" className="text-button" onClick={copyCommand} aria-label="复制 macOS 安全命令">
        {copied ? <><Check size={14} aria-hidden="true" />已复制</> : <><Copy size={14} aria-hidden="true" />复制命令</>}
      </button>
    </div>}
  </section>;
}
