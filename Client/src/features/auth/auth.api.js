import { API_URL, apiRequest } from "../../shared/api/httpClient.js"

export function login({ loginId, password, rememberMe }) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ loginId, password, rememberMe }),
  })
}

export function signup({ nickname, loginId, email, password }) {
  return apiRequest("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ nickname, loginId, email, password }),
  })
}

export function getCurrentUser() {
  return apiRequest("/auth/me")
}

export function refreshSession() {
  return apiRequest("/auth/refresh", { method: "POST" })
}

export function logout() {
  return apiRequest("/auth/logout", { method: "POST" })
}

export function startOAuth(provider) {
  window.location.assign(`${API_URL}/auth/${provider}`)
}
