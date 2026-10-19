// encoding-fix.ts - 全局UTF-8编码设置
// 解决控制台中文乱码问题

let streamGuardsInstalled = false

function installStreamErrorGuards() {
  if (streamGuardsInstalled) return
  streamGuardsInstalled = true
  for (const stream of [process.stdout, process.stderr]) {
    stream?.on('error', (error: NodeJS.ErrnoException) => {
      // Electron may inherit a console pipe that is closed by the launcher.
      // An EPIPE from diagnostic output must not terminate the main process.
      if (error.code !== 'EPIPE') {
        setImmediate(() => { throw error })
      }
    })
  }
}

export function setupUTF8Encoding() {
  installStreamErrorGuards()
  // 设置Node.js进程的标准输出为UTF-8编码
  if (process.stdout && typeof process.stdout.setEncoding === 'function') {
    process.stdout.setEncoding('utf8');
  }

  if (process.stderr && typeof process.stderr.setEncoding === 'function') {
    process.stderr.setEncoding('utf8');
  }

  // 设置环境变量以确保UTF-8编码
  process.env.LANG = 'en_US.UTF-8';
  process.env.LC_ALL = 'en_US.UTF-8';
  process.env.NODE_OPTIONS = '--max-old-space-size=4096';

  // 如果是Windows系统，设置控制台代码页为UTF-8
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      // 设置控制台为UTF-8编码
      execSync('chcp 65001', { stdio: 'ignore' });
      // 设置Windows环境变量
      process.env.PYTHONIOENCODING = 'utf-8';
      process.env.PYTHONLEGACYWINDOWSSTDIO = '1';
    } catch (error) {
      console.log('Note: Could not set Windows console to UTF-8');
    }
  }

  console.log('✅ UTF-8 encoding configured for console output');
}

// 重写console方法以确保UTF-8输出
export function patchConsoleForUTF8() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;

  // 创建UTF-8安全的消息处理函数
  const processMessage = (arg: any): any => {
    if (typeof arg === 'string') {
      try {
        // 确保字符串以UTF-8编码处理
        const buffer = Buffer.from(arg, 'utf8');
        return buffer.toString('utf8');
      } catch (error) {
        return arg; // 如果转换失败，返回原值
      }
    }
    return arg;
  };

  const writeSafely = (writer: (...args: any[]) => void, args: any[]) => {
    try {
      writer.apply(console, args)
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EPIPE') throw error
    }
  }

  console.log = (...args: any[]) => {
    try {
      const processedArgs = args.map(processMessage);
      writeSafely(originalLog, processedArgs);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EPIPE') writeSafely(originalLog, args)
    }
  };

  console.error = (...args: any[]) => {
    try {
      const processedArgs = args.map(processMessage);
      writeSafely(originalError, processedArgs);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EPIPE') writeSafely(originalError, args)
    }
  };

  console.warn = (...args: any[]) => {
    try {
      const processedArgs = args.map(processMessage);
      writeSafely(originalWarn, processedArgs);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EPIPE') writeSafely(originalWarn, args)
    }
  };

  console.info = (...args: any[]) => {
    try {
      const processedArgs = args.map(processMessage);
      writeSafely(originalInfo, processedArgs);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EPIPE') writeSafely(originalInfo, args)
    }
  };
}
