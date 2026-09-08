import { API_BASE } from "./api";

const authHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const request = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
    ...options,
  });
  if (!response.ok) {
    throw new Error(`Notification request failed (${response.status})`);
  }
  return response.json();
};

/** WebSocket URL for the live notification channel. */
export const notificationSocketUrl = (token) => {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/ws/notifications?token=${encodeURIComponent(token)}`;
};

export const notificationApi = {
  list: (limit = 50) => request(`/api/notifications?limit=${limit}`),

  markRead: (notificationId) =>
    request(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: "POST",
    }),

  markAllRead: () => request("/api/notifications/read-all", { method: "POST" }),

  remove: (notificationId) =>
    request(`/api/notifications/${encodeURIComponent(notificationId)}`, {
      method: "DELETE",
    }),

  clearAll: () => request("/api/notifications", { method: "DELETE" }),
};

export default notificationApi;
