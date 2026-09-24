// encoding-fix.ts - 全局UTF-8编码设置
// 解决控制台中文乱码问题

export function setupUTF8Encoding() {
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

  console.log = (...args: any[]) => {
    try {
      const processedArgs = args.map(processMessage);
      originalLog.apply(console, processedArgs);
    } catch (error) {
      originalLog.apply(console, args); // 降级处理
    }
  };

  console.error = (...args: any[]) => {
    try {
      const processedArgs = args.map(processMessage);
      originalError.apply(console, processedArgs);
    } catch (error) {
      originalError.apply(console, args); // 降级处理
    }
  };

  console.warn = (...args: any[]) => {
    try {
      const processedArgs = args.map(processMessage);
      originalWarn.apply(console, processedArgs);
    } catch (error) {
      originalWarn.apply(console, args); // 降级处理
    }
  };

  console.info = (...args: any[]) => {
    try {
      const processedArgs = args.map(processMessage);
      originalInfo.apply(console, processedArgs);
    } catch (error) {
      originalInfo.apply(console, args); // 降级处理
    }
  };
}