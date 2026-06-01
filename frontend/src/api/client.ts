import type { ApiError } from '@/types/api'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

async function refreshToken(): Promise<string | null> {
  const stored = localStorage.getItem('lt-refresh-token')
  if (!stored) return null

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: stored }),
  })

  if (!res.ok) {
    localStorage.removeItem('lt-refresh-token')
    accessToken = null
    return null
  }

  const data = await res.json()
  accessToken = data.accessToken
  return data.accessToken
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  let res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401 && accessToken) {
    if (!refreshPromise) {
      refreshPromise = refreshToken()
    }
    const newToken = await refreshPromise
    refreshPromise = null

    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
    } else {
      accessToken = null
      localStorage.removeItem('lt-refresh-token')
      throw new Error('Session expired')
    }
  }

  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error)
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
  return res.json()
}
