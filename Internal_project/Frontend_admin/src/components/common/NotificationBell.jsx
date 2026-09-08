import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2, X } from 'lucide-react';

const TYPE_STYLES = {
  order_created: 'bg-blue-100 text-blue-700',
  order_status: 'bg-emerald-100 text-emerald-700',
  payment: 'bg-amber-100 text-amber-700',
  stock: 'bg-rose-100 text-rose-700',
  info: 'bg-slate-100 text-slate-600',
};

const relativeTime = (iso) => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

/**
 * Header bell: unread badge, dropdown feed, and per-item read/delete actions.
 * Clicking an item marks it read and routes to the record it refers to.
 */
const NotificationBell = ({ notifications }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const { items, unreadCount, isConnected, markRead, markAllRead, remove, clearAll } = notifications;

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const handleOpenItem = (item) => {
    if (!item.read) markRead(item.notification_id);
    setIsOpen(false);
    if (item.link) navigate(item.link);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
              <span
                className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-300'}`}
                title={isConnected ? 'Live' : 'Reconnecting'}
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                title="Mark all as read"
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <CheckCheck className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={items.length === 0}
                title="Clear all"
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="custom-scrollbar max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                You&apos;re all caught up.
              </p>
            ) : (
              items.map((item) => (
                <div
                  key={item.notification_id}
                  className={`group flex gap-3 border-b border-slate-50 px-4 py-3 transition last:border-b-0 ${
                    item.read ? 'bg-white' : 'bg-blue-50/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenItem(item)}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      {!item.read && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                      <span className="text-sm font-semibold text-slate-800">{item.title}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{item.message}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          TYPE_STYLES[item.type] || TYPE_STYLES.info
                        }`}
                      >
                        {String(item.type).replace(/_/g, ' ')}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {relativeTime(item.created_at)}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => remove(item.notification_id)}
                    title="Delete"
                    className="h-7 w-7 shrink-0 rounded-lg text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                  >
                    <X className="mx-auto h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
