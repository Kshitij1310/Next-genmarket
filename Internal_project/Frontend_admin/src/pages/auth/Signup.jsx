import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

// ============================================
// ZOD VALIDATION SCHEMA
// ============================================
const signupSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const Signup = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [formState, setFormState] = useState({
    name: '',
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
    const validation = signupSchema.safeParse(formState);

    if (!validation.success) {
      const firstError = validation.error.errors[0].message;
      toast.error(firstError);
      setIsSubmitting(false);
      return;
    }

    // Attempt signup
    const result = await signup({
      name: formState.name,
      email: formState.email,
      password: formState.password,
    });

    if (!result.success) {
      toast.error(result.error);
      setIsSubmitting(false);
      return;
    }

    // Success - redirect to login
    toast.success('Account created successfully');
    navigate('/login', { replace: true });
    setIsSubmitting(false);
  };

  return (
    <div className="auth-shell min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-4 py-12">
      <div className="auth-card w-full max-w-md rounded-xl bg-white shadow-lg border border-slate-200">
        <div className="px-8 py-10">
          <div className="auth-head text-center">
            <p className="auth-brand text-xs uppercase tracking-[0.3em] text-slate-500 font-semibold">
              NexChain
            </p>
            <h1 className="auth-title mt-3 text-3xl font-bold text-slate-900">Create account</h1>
            <p className="auth-subtitle mt-2 text-sm text-slate-600">
              Get started with your new account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form mt-8 space-y-5">
            <div>
              <label className="form-label block text-sm font-medium text-slate-700">Full Name</label>
              <input
                type="text"
                name="name"
                value={formState.name}
                onChange={handleChange}
                placeholder="John Doe"
                className="form-input mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>

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
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link to="/login" className="auth-link font-medium text-blue-600 hover:text-blue-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
