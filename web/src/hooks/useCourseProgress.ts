import { useEffect, useState } from 'react'
import { apiFetch, jsonBody } from '../api/client'
import type { CourseId } from '../types'

export function useCourseProgress(username: string, courseId: CourseId) {
  const [completed, setCompleted] = useState<string[]>([])
  const [error, setError] = useState('')

  const load = async () => {
    if (!username) { setCompleted([]); return }
    try {
      const data = await apiFetch<{ completed: string[] }>(`/api/courses/${courseId}/progress/${encodeURIComponent(username)}`)
      setCompleted(data.completed || [])
      setError('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '路线进度读取失败')
    }
  }

  useEffect(() => { void load() }, [username, courseId])

  const toggle = async (stepId: string) => {
    const data = await apiFetch<{ completed: string[] }>('/api/courses/progress/toggle', jsonBody({ username, course_id: courseId, step_id: stepId }))
    setCompleted(data.completed || [])
    setError('')
  }

  return { completed, error, load, toggle }
}
