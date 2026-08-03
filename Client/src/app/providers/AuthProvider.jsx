import { useEffect, useMemo, useState } from "react"
import {
  getCurrentUser,
  login as requestLogin,
  logout as requestLogout,
  refreshSession,
} from "../../features/auth/auth.api.js"
import { AuthContext } from "./authContext.js"

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function restoreSession() {
      try {
        const data = await getCurrentUser()
        if (active) setUser(data.user)
      } catch {
        try {
          await refreshSession()
          const data = await getCurrentUser()
          if (active) setUser(data.user)
        } catch {
          if (active) setUser(null)
        }
      } finally {
        if (active) setIsLoading(false)
      }
    }

    restoreSession()
    return () => { active = false }
  }, [])

  async function login(credentials) {
    const data = await requestLogin(credentials)
    setUser(data.user)
    return data.user
  }

  async function logout() {
    try {
      await requestLogout()
    } finally {
      setUser(null)
    }
  }

  const value = useMemo(
    () => ({ user, isLoading, login, logout }),
    [user, isLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
