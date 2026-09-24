export interface ProblemStatementData {
  content?: string
  type?: string
  timestamp?: number
  isExtracting?: boolean
  [key: string]: any
}

export interface MultipleChoiceAnswer {
  option?: string
  question_number: string
  answer: string
  text?: string
  explanation?: string
  isCorrect?: boolean
  [key: string]: any
}

export interface SolutionData {
  type?: 'programming' | 'multiple_choice' | 'single_choice' | 'universal' | string
  code?: string
  thoughts?: string[] | null
  time_complexity?: string | null
  space_complexity?: string | null
  answers?: MultipleChoiceAnswer[] | null
  isStreaming?: boolean
  [key: string]: any
}
