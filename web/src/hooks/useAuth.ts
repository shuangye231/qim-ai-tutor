import { useState } from 'react'
import { apiFetch, jsonBody } from '../api/client'

interface AuthResponse {
  status: string
  username?: string
  session_token?: string
  role?: string
  message?: string
}

export type LoginPortal = 'student' | 'teacher' | 'developer'

export function useAuth() {
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem('currentUser') || '')
  const [sessionToken, setSessionToken] = useState(() => localStorage.getItem('sessionToken') || '')
  const [role, setRole] = useState(() => localStorage.getItem('userRole') || 'user')

  const login = async (username: string, password: string, portal: LoginPortal, institutionCode = '') => {
    const data = await apiFetch<AuthResponse>('/api/login', jsonBody({ username, password, portal, institution_code: institutionCode }))
    const user = data.username || username
    const token = data.session_token || ''
    localStorage.setItem('currentUser', user)
    localStorage.setItem('sessionToken', token)
    localStorage.setItem('userRole', data.role || 'user')
    setCurrentUser(user)
    setSessionToken(token)
    setRole(data.role || 'user')
    return data.role || 'user'
  }

  const register = async (username: string, password: string) => {
    await apiFetch<AuthResponse>('/api/register', jsonBody({ username, password }))
  }

  const changePassword = async (oldPassword: string, newPassword: string) => {
    await apiFetch<AuthResponse>('/api/password', jsonBody({
      username: currentUser,
      old_password: oldPassword,
      new_password: newPassword,
    }))
  }

  const deleteAccount = async () => {
    await apiFetch<AuthResponse>('/api/profile/account', jsonBody({ username: currentUser }))
    const prefixes = [
      `ai-tutor-web-sessions-v4:${currentUser}`,
      `ai-tutor-web-sessions-v3:${currentUser}`,
      `ai-tutor-web-course:${currentUser}`,
      `ai-tutor-user-avatar:${currentUser}`,
      `ai-tutor-ai-avatar:${currentUser}`,
      `ai-tutor-contests:${currentUser}`,
      `ai-tutor-oj-solved:${currentUser}`,
      `ai-tutor-active-exam:${currentUser}`,
      `ai-tutor-oj-source:${currentUser}:`,
      `qima-code-workspace:${currentUser}:`,
    ]
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key && prefixes.some((prefix) => key === prefix || key.startsWith(prefix))) localStorage.removeItem(key)
    }
    localStorage.removeItem('currentUser')
    localStorage.removeItem('sessionToken')
    localStorage.removeItem('userRole')
    setCurrentUser('')
    setSessionToken('')
    setRole('user')
  }

  const logout = () => {
    localStorage.removeItem('currentUser')
    localStorage.removeItem('sessionToken')
    localStorage.removeItem('userRole')
    setCurrentUser('')
    setSessionToken('')
    setRole('user')
  }

  return { currentUser, sessionToken, role, login, register, changePassword, deleteAccount, logout }
}
