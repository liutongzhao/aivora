declare module 'screenshot-desktop' {
  interface ScreenshotDesktopOptions {
    format?: string
    filename?: string
    screen?: string
  }
  interface DisplayInfo { id: string | number; name?: string; [key: string]: unknown }
  interface ScreenshotDesktop {
    (options?: ScreenshotDesktopOptions): Promise<Buffer>
    listDisplays(): Promise<DisplayInfo[]>
  }
  const screenshot: ScreenshotDesktop
  export = screenshot
}

declare module 'react-dom/test-utils' {
  export namespace Simulate { const waiting: any; }
  export function act<T>(callback: () => T | Promise<T>): Promise<T> | T
}
