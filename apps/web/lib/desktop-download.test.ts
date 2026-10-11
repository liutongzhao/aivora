import { describe, expect, it } from "vitest";
import { getDesktopDownload, getDesktopPlatform } from "./desktop-download";

describe("desktop download", () => {
  it("uses the latest direct download for macOS", () => {
    expect(getDesktopPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("mac");
    expect(getDesktopDownload("mac")).toEqual({
      href: "https://download.aivora.cuzisme.cn/Aivora-latest.dmg",
      label: "下载 macOS 版",
    });
  });

  it("uses the latest direct download for Windows", () => {
    expect(getDesktopPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(getDesktopDownload("windows")).toEqual({
      href: "https://download.aivora.cuzisme.cn/Aivora-latest.exe",
      label: "下载 Windows 版",
    });
  });

  it("falls back to an explicit platform choice", () => {
    expect(getDesktopPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("unknown");
    expect(getDesktopDownload("unknown")).toBeNull();
  });
});
