import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';


const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formState, setFormState] = useState({
    email: '',
    password: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);

    // Validate form data with Zod
    const validation = loginSchema.safeParse(formState);

    if (!validation.success) {
      const firstError = validation.error.errors[0].message;
      toast.error(firstError);
      setIsSubmitting(false);
      return;
    }

    // Attempt login with email and password
    const result = await login({
      email: formState.email,
      password: formState.password,
    });

    if (!result.success) {
      toast.error(result.error);
      setIsSubmitting(false);
      return;
    }

    // Success - redirect based on role
    toast.success('Login successful');
    const nextPath = result.data.role === 'admin' ? '/admin/dashboard' : '/customer/dashboard';
    navigate(nextPath, { replace: true });
    setIsSubmitting(false);
  };

  return (
    <div className="auth-shell min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-4">
      <div className="auth-card w-full max-w-md rounded-xl bg-white shadow-lg border border-slate-200">
        <div className="px-8 py-10">
          <div className="auth-head text-center">
            <p className="auth-brand text-xs uppercase tracking-[0.3em] text-slate-500 font-semibold">
              NexChain
            </p>
            <h1 className="auth-title mt-3 text-3xl font-bold text-slate-900">Welcome back</h1>
            <p className="auth-subtitle mt-2 text-sm text-slate-600">
              Sign in to access your workspace
            </p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form mt-8 space-y-5">
            <div>
              <label className="form-label block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                name="email"
                value={formState.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="form-input mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>

            <div>
              <label className="form-label block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                name="password"
                value={formState.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="form-input mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Don't have an account?{' '}
            <Link to="/signup" className="auth-link font-medium text-blue-600 hover:text-blue-700">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
