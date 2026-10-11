export type DesktopPlatform = "mac" | "windows" | "unknown";

const downloads = {
  mac: { href: "/downloads/Aivora-latest.dmg", label: "下载 macOS 版" },
  windows: { href: "/downloads/Aivora-latest.exe", label: "下载 Windows 版" },
} as const;

export function getDesktopPlatform(userAgent: string): DesktopPlatform {
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "mac";
  if (/Windows/i.test(userAgent)) return "windows";
  return "unknown";
}

export function getDesktopDownload(platform: DesktopPlatform) {
  return platform === "unknown" ? null : downloads[platform];
}

export const macSecurityCommand = "xattr -dr com.apple.quarantine /Applications/Aivora.app";
