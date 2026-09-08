import { useCallback, useEffect, useRef, useState } from 'react';
import notificationService, { notificationSocketUrl } from '../services/notificationService';

const RECONNECT_DELAY_MS = 4000;
const KEEPALIVE_MS = 25000;
const AUTH_FAILED_CODE = 4401;

/**
 * Loads the notification feed over REST and keeps it live over a WebSocket.
 *
 * The socket is the delivery mechanism; every mutation still goes through REST
 * so the server stays the source of truth for the unread count.
 */
export const useNotifications = (token) => {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef(null);
  const reconnectRef = useRef(null);
  const keepaliveRef = useRef(null);
  const closedByUsRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await notificationService.list();
      setItems(data.items || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      // Feed stays as-is; the bell simply shows the last known state.
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // --- live channel ---------------------------------------------------------
  useEffect(() => {
    if (!token) {
      setItems([]);
      setUnreadCount(0);
      return undefined;
    }

    closedByUsRef.current = false;

    const clearTimers = () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (keepaliveRef.current) clearInterval(keepaliveRef.current);
    };

    const connect = () => {
      if (closedByUsRef.current) return;

      let socket;
      try {
        socket = new WebSocket(notificationSocketUrl(token));
      } catch {
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
        keepaliveRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send('ping');
        }, KEEPALIVE_MS);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.event !== 'notification' || !payload.data) return;
          setItems((prev) => {
            if (prev.some((n) => n.notification_id === payload.data.notification_id)) {
              return prev;
            }
            return [payload.data, ...prev];
          });
          setUnreadCount((prev) => prev + 1);
        } catch {
          // Ignore malformed frames.
        }
      };

      socket.onclose = (event) => {
        setIsConnected(false);
        if (keepaliveRef.current) clearInterval(keepaliveRef.current);
        // 4401 = server rejected the JWT. Retrying cannot help until the user
        // logs in again, so stop instead of reconnecting every few seconds.
        if (event.code === AUTH_FAILED_CODE) return;
        if (!closedByUsRef.current) {
          reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      socket.onerror = () => socket.close();
    };

    refresh();
    connect();

    return () => {
      closedByUsRef.current = true;
      clearTimers();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [token, refresh]);

  // --- mutations ------------------------------------------------------------
  const markRead = useCallback(async (notificationId) => {
    setItems((prev) =>
      prev.map((n) => (n.notification_id === notificationId ? { ...n, read: true } : n)),
    );
    try {
      const res = await notificationService.markRead(notificationId);
      setUnreadCount(res.unread_count ?? 0);
    } catch {
      refresh();
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await notificationService.markAllRead();
    } catch {
      refresh();
    }
  }, [refresh]);

  const remove = useCallback(async (notificationId) => {
    setItems((prev) => prev.filter((n) => n.notification_id !== notificationId));
    try {
      const res = await notificationService.remove(notificationId);
      setUnreadCount(res.unread_count ?? 0);
    } catch {
      refresh();
    }
  }, [refresh]);

  const clearAll = useCallback(async () => {
    setItems([]);
    setUnreadCount(0);
    try {
      await notificationService.clearAll();
    } catch {
      refresh();
    }
  }, [refresh]);

  return { items, unreadCount, isLoading, isConnected, refresh, markRead, markAllRead, remove, clearAll };
};

export default useNotifications;
