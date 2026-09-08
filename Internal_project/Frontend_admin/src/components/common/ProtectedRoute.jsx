import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const ProtectedRoute = ({ children, allowedRoles }) => {
  const { currentUser, role, isAuthenticated, isLoading } = useAuth();

  // Show loading state
  if (isLoading) {
    return (
      <div className="auth-shell min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
        <div className="surface-card text-center rounded-2xl px-10 py-8">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">NexChain</p>
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-sm font-medium text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // STRICT: If no currentUser, redirect to login
  if (!isAuthenticated || !currentUser) {
    return <Navigate to="/login" replace />;
  }

  // STRICT: Role-based access control
  // If admin tries to access customer route → redirect to admin dashboard
  // If customer tries to access admin route → redirect to customer dashboard
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    const redirectPath = role === 'admin' ? '/admin/dashboard' : '/customer/dashboard';
    return <Navigate to={redirectPath} replace />;
  }

  return children;
};

export default ProtectedRoute;
