import React, { useEffect, useRef, useState } from 'react';

interface ClickThroughManagerProps {
  children: React.ReactNode;
  nonClickThroughSelectors: string[];
}

/**
 * ClickThroughManager组件
 * 
 * 这个组件使用区域性穿透API，根据指定的选择器计算不应穿透的区域。
 * 它会监听DOM变化，并在需要时更新穿透区域。
 */
const ClickThroughManager: React.FC<ClickThroughManagerProps> = ({ 
  children, 
  nonClickThroughSelectors 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // 主要的事件穿透设置逻辑
  useEffect(() => {
    if (!isInitialized) return;
    
    // 计算不应穿透的区域
    const calculateExceptRegions = () => {
      if (!containerRef.current) return [];
      
      const exceptRegions: Array<{x: number, y: number, width: number, height: number}> = [];
      
      // 查找所有不应穿透的元素
      nonClickThroughSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          const rect = element.getBoundingClientRect();
          
          // 添加元素的位置和大小到例外区域
          exceptRegions.push({
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          });
        });
      });
      
      return exceptRegions;
    };
    
    // 设置区域性穿透
    const setupClickThrough = () => {
      const exceptRegions = calculateExceptRegions();
      window.electronAPI.setIgnoreMouseEventsExcept(exceptRegions);
    };
    
    // 初始设置
    setupClickThrough();
    
    // 创建一个MutationObserver，以确保在DOM变化后仍能正确处理事件
    const observer = new MutationObserver(() => {
      setupClickThrough();
    });
    
    // 观察DOM变化
    if (containerRef.current) {
      observer.observe(containerRef.current, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }
    
    // 监听窗口大小变化
    window.addEventListener('resize', setupClickThrough);
    
    // 监听窗口焦点变化 - 窗口重新获得焦点时更新区域
    const handleFocus = () => {
      // 延迟一点执行，确保窗口状态完全稳定
      setTimeout(setupClickThrough, 100);
    };
    window.addEventListener('focus', handleFocus);
    
    // 监听visibility变化 - 页面重新可见时更新
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setTimeout(setupClickThrough, 100);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 清理函数
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', setupClickThrough);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // 恢复正常模式
      window.electronAPI.setIgnoreMouseEvents(false);
    };
  }, [nonClickThroughSelectors, isInitialized]);
  
  // 初始化延迟，确保DOM已完全加载
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialized(true);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);
  
  // 添加全局CSS样式，确保正确的事件穿透行为
  useEffect(() => {
    // 创建style元素
    const style = document.createElement('style');
    style.innerHTML = `
      .pointer-events-none {
        pointer-events: none !important;
      }
      .user-select-none {
        user-select: none !important;
        -webkit-user-select: none !important;
      }
    `;
    
    // 添加到head
    document.head.appendChild(style);
    
    // 清理函数
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  
  return (
    <div ref={containerRef} className="click-through-manager">
      {children}
    </div>
  );
};

export default ClickThroughManager; 
