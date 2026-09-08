import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Warehouse,
  MapPin,
  MessageSquare,
  RefreshCw,
  Settings as SettingsIcon,
  ClipboardList,
  AlertTriangle,
} from 'lucide-react';
const Sidebar = () => {
  const navItems = [
    {
      name: 'Dashboard',
      path: '/admin/dashboard',
      icon: LayoutDashboard,
    },
    {
      name: 'Products',
      path: '/admin/products',
      icon: Package,
    },
    {
      name: 'Inventory',
      path: '/admin/inventory',
      icon: Warehouse,
    },
    {
      name: 'Expiry Alerts',
      path: '/admin/expiry-alerts',
      icon: AlertTriangle,
    },
    {
      name: 'Reorder',
      path: '/admin/reorder',
      icon: RefreshCw,
    },
    {
      name: 'Order Management',
      path: '/admin/order-management',
      icon: ClipboardList,
    },
    {
      name: 'Tracking',
      path: '/admin/tracking',
      icon: MapPin,
    },
    {
      name: 'AI Chat',
      path: '/admin/ai-chat',
      icon: MessageSquare,
    },
    // {
    //   name: 'Payments',
    //   path: '/admin/payments',
    //   icon: CreditCard,
    // },
    {
      name: 'Settings',
      path: '/admin/settings',
      icon: SettingsIcon,
    },
  ];

  return (
    <aside className="app-sidebar w-64 bg-white border-r border-slate-200 flex flex-col">
      {/* Logo */}
      <div className="sidebar-brand px-6 py-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="brand-mark w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
            <svg viewBox="0 0 48 48" aria-hidden="true" className="h-6 w-6 fill-none stroke-current text-white">
              <path d="M7 14h34l-3 19H10L7 14Z" strokeWidth="2.4" />
              <path d="M18 14a6 6 0 0 1 12 0" strokeWidth="2.4" />
              <path d="M18 23h12" strokeWidth="2.4" />
            </svg>
          </div>
          <div className="brand-copy">
            <p className="brand-name text-xl font-bold text-slate-800">NexChain</p>
            <p className="brand-tagline text-xs text-slate-500">Marketplace Ops</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav flex-1 px-4 py-6 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-nav-item flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'is-active bg-blue-50 text-blue-600'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer px-6 py-4 border-t border-slate-200">
        <p className="text-xs text-slate-500">Built for smart commerce logistics</p>
        <p className="mt-1 text-xs text-slate-400">Copyright 2026 NexChain</p>
      </div>
    </aside>
  );
};

export default Sidebar;
