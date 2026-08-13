import { apiRequest } from "../../shared/api/httpClient.js"

export function getUserStats() {
  return apiRequest("/admin/users/stats")
}

export function getUsers({ page = 1, pageSize = 20, status = "" } = {}) {
  const query = new URLSearchParams({ page, pageSize })
  if (status) query.set("status", status)
  return apiRequest(`/admin/users?${query.toString()}`)
}

export function updateUserStatus(userId, status) {
  return apiRequest(`/admin/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  })
}