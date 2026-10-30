// @ts-nocheck
import { create } from 'zustand'
import type { PublishPlatform, PublishTask, PublishTaskStatus } from '../types/publish'

interface CreateTaskInput {
  workId?: string
  workLabel?: string
  videoPath: string
  title: string
  tags?: string
  platforms?: PublishPlatform[]
  accountIds?: string[]
  publishMode?: 'manual' | 'auto'
}

interface PublishTasksState {
  tasks: PublishTask[]
  loading: boolean
  loadTasks: () => Promise<void>
  saveTasks: (list: PublishTask[]) => Promise<void>
  addTask: (input: CreateTaskInput) => Promise<PublishTask>
  updateTask: (id: string, patch: Partial<PublishTask>) => Promise<void>
  removeTask: (id: string) => Promise<void>
}

export const usePublishTasksStore = create<PublishTasksState>((set, get) => ({
  tasks: [],
  loading: false,

  loadTasks: async () => {
    if (!(window as any).api?.getPublishTasks) return
    set({ loading: true })
    try {
      const list = await (window as any).api.getPublishTasks()
      set({ tasks: Array.isArray(list) ? list : [] })
    } finally {
      set({ loading: false })
    }
  },

  saveTasks: async (list) => {
    const sorted = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    set({ tasks: sorted })
    await (window as any).api?.savePublishTasks?.(sorted)
  },

  addTask: async (input) => {
    const now = Date.now()
    const task: PublishTask = {
      id: `task_${now}_${Math.random().toString(36).slice(2, 8)}`,
      workId: input.workId,
      workLabel: input.workLabel,
      videoPath: input.videoPath,
      title: input.title || input.workLabel || '未命名作品',
      tags: input.tags || '',
      platforms: input.platforms?.length ? input.platforms : ['douyin'],
      accountIds: input.accountIds || [],
      publishMode: input.publishMode || 'manual',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    const next = [task, ...get().tasks]
    await get().saveTasks(next)
    return task
  },

  updateTask: async (id, patch) => {
    const next = get().tasks.map((t) =>
      t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t,
    )
    await get().saveTasks(next)
  },

  removeTask: async (id) => {
    const next = get().tasks.filter((t) => t.id !== id)
    await get().saveTasks(next)
  },
}))

export function taskStatusLabel(status: PublishTaskStatus) {
  switch (status) {
    case 'pending':
      return '待发布'
    case 'publishing':
      return '发布中'
    case 'done':
      return '已完成'
    case 'failed':
      return '失败'
    default:
      return status
  }
}
