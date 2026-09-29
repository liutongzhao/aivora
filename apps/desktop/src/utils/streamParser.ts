// 简化的流式解析器 - 后端现在负责主要解析工作
// 这里只保留必要的类型定义和简单的显示判断逻辑

export interface ParsedStreamContent {
  code: string
  thoughts: string[]
  timeComplexity: string | null
  spaceComplexity: string | null
  time_complexity?: string | null
  space_complexity?: string | null
  answers?: Array<{
    question_number: string
    answer: string
    reasoning: string
  }>
  type: 'programming' | 'multiple_choice'
  isComplete: boolean
  progress: number
}

/**
 * 简化版流式解析 - 主要用于兼容现有代码
 * 实际解析现在由后端完成
 */
export function parseStreamedSolution(content: string): ParsedStreamContent {
  // 简单的类型判断
  const isMultipleChoice = /[A-D][\s\S]*选项|题目\d+.*[A-D]|答案.*[A-D]/i.test(content)
  
  return {
    code: isMultipleChoice ? '' : content,
    thoughts: ['正在分析中...'],
    timeComplexity: null,
    spaceComplexity: null,
    time_complexity: null,
    space_complexity: null,
    answers: isMultipleChoice ? [{ question_number: '1', answer: 'A', reasoning: '分析中...' }] : undefined,
    type: isMultipleChoice ? 'multiple_choice' : 'programming',
    isComplete: false,
    progress: 50
  }
}

/**
 * 判断是否应该开始显示内容
 */
export function shouldStartDisplaying(content: string): boolean {
  // 简化判断 - 有内容就显示
  return !!(content && content.length > 10)
}
