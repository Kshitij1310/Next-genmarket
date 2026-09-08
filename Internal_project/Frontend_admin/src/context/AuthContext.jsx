import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api.js';

const AuthContext = createContext(null);
const CURRENT_USER_KEY = 'currentUser';
const TOKEN_KEY = 'authToken';

// ============================================
// HELPER FUNCTIONS
// ============================================

const readCurrentUser = () => {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('Error reading current user:', error);
    return null;
  }
};

const writeCurrentUser = (user) => {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
};

const clearCurrentUser = () => {
  localStorage.removeItem(CURRENT_USER_KEY);
};

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.error('Error reading token:', error);
    return null;
  }
};

const writeToken = (token) => {
  localStorage.setItem(TOKEN_KEY, token);
};

const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

// ============================================
// AUTH PROVIDER
// ============================================

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state from localStorage
  useEffect(() => {
    const savedUser = readCurrentUser();
    const savedToken = readToken();
    setCurrentUser(savedUser);
    setToken(savedToken);
    setIsLoading(false);
  }, []);

  // ============================================
  // SIGNUP
  // POST /api/auth/signup
  // ============================================
  const signup = async ({ name, email, password }) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await api.signup({ name: name.trim(), email: normalizedEmail, password });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message || 'Signup failed' };
    }
  };

  // ============================================
  // LOGIN
  // POST /api/auth/admin/login
  // Returns JWT token
  // ============================================
  const login = async ({ email, password }) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const payload = { email: normalizedEmail, password };
      const response = await api.login(payload);

      const safeUserData = {
        id: response.user?.id || null,
        email: response.user?.email || normalizedEmail,
        role: response.role || response.user?.role || 'customer',
      };

      writeToken(response.access_token);
      writeCurrentUser(safeUserData);
      setToken(response.access_token);
      setCurrentUser(safeUserData);

      return { success: true, data: safeUserData };
    } catch (error) {
      return { success: false, error: error.message || 'Login failed' };
    }
  };

  // ============================================
  // LOGOUT
  // Clear JWT token
  // ============================================
  const logout = () => {
    clearCurrentUser();
    clearToken();
    setCurrentUser(null);
    setToken(null);
    toast.success('Logged out successfully');
  };

  const value = useMemo(
    () => ({
      currentUser,
      role: currentUser?.role || null,
      isAuthenticated: Boolean(currentUser),
      isLoading,
      token,
      signup,
      login,
      logout,
    }),
    [currentUser, isLoading, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
