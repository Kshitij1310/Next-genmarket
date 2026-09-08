import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NotificationBell from '../components/common/NotificationBell';
import useNotifications from '../hooks/useNotifications';

const Navbar = () => {
  const navigate = useNavigate();
  const { currentUser, token, logout } = useAuth();
  const notifications = useNotifications(token);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="app-topbar bg-white border-b border-slate-200 px-6 py-4">
      <div className="topbar-inner flex items-center justify-between">
        {/* Left side - can add breadcrumbs or search later */}
        <div className="flex-1">
          <p className="topbar-kicker text-xs uppercase tracking-[0.22em] text-slate-500">Operations Console</p>
          <h2 className="topbar-title text-lg font-semibold text-slate-800">Admin Panel</h2>
        </div>

        {/* Right side - User info and logout */}
        <div className="topbar-actions flex items-center gap-4">
          <NotificationBell notifications={notifications} />

          {/* User Info */}
          <div className="topbar-user flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">
                {currentUser?.name || 'Admin User'}
              </p>
              <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                Admin
              </span>
            </div>
            
            {/* Avatar */}
            <div className="topbar-avatar w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {currentUser?.name?.charAt(0).toUpperCase() || 'A'}
              </span>
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="btn btn-outline flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
