/**
 * 全局状态管理（Zustand Store）
 *
 * TODO（开发者任务）：
 * 1. 实现 fetchProfile() — 从 API 加载画像
 * 2. 实现 fetchLearningPath() — 从 API 加载路径
 * 3. 实现 fetchResources() — 从 API 加载资源列表
 * 4. 添加 WebSocket/SSE 连接状态管理
 */
import { create } from 'zustand'

interface StudentProfile {
  knowledge_level: { score: number; weak_points: string[] }
  cognitive_style: string
  learning_goal: string
  error_prone_topics: string[]
  available_time_per_day: number
  interest_direction: string[]
  completeness: number
}

interface LearningResource {
  resource_id: string
  resource_type: string
  title: string
  content: any
  generated_at: string
}

interface AppState {
  // 学生 ID（实际项目中从登录获取）
  studentId: string

  // 学生画像
  profile: StudentProfile | null
  isProfileLoading: boolean

  // 学习路径
  learningPath: any[] | null

  // 资源列表
  resources: LearningResource[]
  isResourcesLoading: boolean

  // Actions
  setStudentId: (id: string) => void
  setProfile: (profile: StudentProfile) => void
  addResource: (resource: LearningResource) => void
  setLearningPath: (path: any[]) => void
}

export const useAppStore = create<AppState>((set) => ({
  studentId: 'demo_student_001',  // TODO: 从登录流程获取
  profile: null,
  isProfileLoading: false,
  learningPath: null,
  resources: [],
  isResourcesLoading: false,

  setStudentId: (id) => set({ studentId: id }),
  setProfile: (profile) => set({ profile }),
  addResource: (resource) => set((state) => ({
    resources: [...state.resources, resource]
  })),
  setLearningPath: (path) => set({ learningPath: path }),
}))
