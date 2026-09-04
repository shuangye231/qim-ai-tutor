export type Role = 'user' | 'assistant'
export type CourseId = 'scratch' | 'python' | 'cpp'

export interface CodeContext {
  courseId: CourseId
  language: 'scratch' | 'python' | 'cpp'
  source: string
  stdin: string
  stdout: string
  stderr: string
  status: 'idle' | 'running' | 'success' | 'error'
  workspace?: string
  updatedAt: number
}

export interface Message {
  id: string
  role: Role
  content: string
  createdAt: number
}

export interface Session {
  id: string
  courseId: CourseId
  title: string
  messages: Message[]
  updatedAt: number
}

export interface SessionAttachment {
  id: string
  name: string
  size: number
}

export interface KnowledgeFile {
  stored_name: string
  name: string
  owner: string
  chunks: number
  size: number
  updated_at: string
  class_id?: string | null
  class_name?: string
  category?: 'courseware' | 'material'
}

export interface CoursewareExercise {
  id: string
  difficulty: '入门' | '基础' | '进阶'
  type: '选择题' | '填空题' | '编程题'
  title: string
  prompt: string
  answer: string
  explanation: string
  knowledge_points: string[]
}

export interface CoursewareExerciseDraft {
  id: string
  teacher: string
  source_stored_name: string
  title: string
  course_id: 'scratch' | 'python' | 'cpp'
  status: 'draft' | 'saved'
  questions: CoursewareExercise[]
  created_at: string
  updated_at: string
}

export interface ModelOption {
  id: string
  name?: string
  label?: string
  current?: boolean
}

export interface Quota {
  daily_limit: number
  daily_used: number
  daily_remaining: number
  paid_remaining: number
  total_remaining: number
  next_expiry?: string | null
}

export interface BillingPlan {
  code: string
  name: string
  credits: number
  amount_fen: number
  amount_yuan: number
  valid_days: number
  recommended?: boolean
}
