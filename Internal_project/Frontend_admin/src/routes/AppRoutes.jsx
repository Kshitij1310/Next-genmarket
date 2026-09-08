import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Login from '../pages/auth/Login.jsx';
import Signup from '../pages/auth/Signup.jsx';
import AdminDashboard from '../pages/admin/Dashboard.jsx';
import Products from '../pages/admin/Products.jsx';
import Inventory from '../pages/admin/Inventory.jsx';
import Reorder from '../pages/admin/Reorder.jsx';
import Tracking from '../pages/admin/Tracking.jsx';
import OrderManagement from '../pages/admin/OrderManagement.jsx';
import ExpiryAlerts from '../pages/admin/ExpiryAlerts.jsx';
import AiChat from '../pages/admin/AiChat.jsx';
import Payments from '../pages/admin/Payments.jsx';
import PaymentSuccess from '../pages/admin/PaymentSuccess.jsx';
import RevenueDetails from '../pages/admin/RevenueDetails.jsx';
import Settings from '../pages/admin/Settings.jsx';
import CustomerDashboard from '../pages/customer/Dashboard.jsx';
import ProtectedRoute from '../components/common/ProtectedRoute.jsx';
import AdminLayout from '../layouts/AdminLayout.jsx';

const OrdersReturnAlias = () => {
  const location = useLocation();
  return <Navigate to={`/admin/order-management${location.search || ''}`} replace />;
};

const AppRoutes = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/orders" element={<OrdersReturnAlias />} />

      {/* Admin Routes with Layout */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="reorder" element={<Reorder />} />
        <Route path="orders" element={<Navigate to="/admin/order-management" replace />} />
        <Route path="order-management" element={<OrderManagement />} />
        <Route path="expiry-alerts" element={<ExpiryAlerts />} />
        <Route path="revenue-details" element={<RevenueDetails />} />
        <Route path="tracking" element={<Tracking />} />
        <Route path="ai-chat" element={<AiChat />} />
        <Route path="payments" element={<Payments />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route
        path="/customer/dashboard"
        element={
          <ProtectedRoute allowedRoles={['customer']}>
            <CustomerDashboard />
          </ProtectedRoute>
        }
      />

      <Route path="/payment-success" element={<PaymentSuccess />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  </BrowserRouter>
);

export default AppRoutes;
