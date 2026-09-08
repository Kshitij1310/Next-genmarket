import { apiFetch, BASE_URL } from './api.js';

/** WebSocket URL for the live notification channel, derived from BASE_URL. */
export const notificationSocketUrl = (token) => {
  const wsBase = BASE_URL.replace(/^http/, 'ws');
  return `${wsBase}/ws/notifications?token=${encodeURIComponent(token)}`;
};

export const notificationService = {
  list: (limit = 50) => apiFetch(`/api/notifications?limit=${limit}`),

  markRead: (notificationId) =>
    apiFetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'POST',
    }),

  markAllRead: () => apiFetch('/api/notifications/read-all', { method: 'POST' }),

  remove: (notificationId) =>
    apiFetch(`/api/notifications/${encodeURIComponent(notificationId)}`, {
      method: 'DELETE',
    }),

  clearAll: () => apiFetch('/api/notifications', { method: 'DELETE' }),
};

export default notificationService;
