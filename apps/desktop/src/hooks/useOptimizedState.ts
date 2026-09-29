// useOptimizedState.ts - 减少不必要重渲染的状态管理
import { useState, useCallback, useRef } from 'react'

// 深度比较函数
function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true
  if (!obj1 || !obj2) return false
  
  const keys1 = Object.keys(obj1)
  const keys2 = Object.keys(obj2)
  
  if (keys1.length !== keys2.length) return false
  
  for (let key of keys1) {
    if (!keys2.includes(key)) return false
    if (typeof obj1[key] === 'object' && typeof obj2[key] === 'object') {
      if (!deepEqual(obj1[key], obj2[key])) return false
    } else if (obj1[key] !== obj2[key]) {
      return false
    }
  }
  
  return true
}

// 优化的setState hook
export function useOptimizedState<T>(initialState: T) {
  const [state, setState] = useState(initialState)
  const lastState = useRef<T>(initialState)
  
  const optimizedSetState = useCallback((newState: T | ((prev: T) => T)) => {
    setState(prevState => {
      const nextState = typeof newState === 'function' 
        ? (newState as (prev: T) => T)(prevState)
        : newState
      
      // 只有在状态真正变化时才更新
      if (!deepEqual(nextState, lastState.current)) {
        lastState.current = nextState
        return nextState
      }
      
      return prevState // 返回相同引用，避免重渲染
    })
  }, [])
  
  return [state, optimizedSetState] as const
}