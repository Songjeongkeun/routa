import { apiRequest } from "../../shared/api/httpClient.js"

export function getUserStats() {
  return apiRequest("/admin/users/stats")
}

export function getUsers({ page = 1, pageSize = 20 } = {}) {
  return apiRequest(`/admin/users?page=${page}&pageSize=${pageSize}`)
}

export function updateUserStatus(userId, status) {
  return apiRequest(`/admin/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  })
}