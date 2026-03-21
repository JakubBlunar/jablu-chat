import { loginSchema } from "@chat/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth.store";

export function LoginPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, isAuthLoading, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? "Invalid input";
      setError(first);
      return;
    }

    setIsSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-auth-bg">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-hidden
        />
        <span className="sr-only">Checking session</span>
      </div>
    );
  }

  return (
    <AuthLayout>
      <h2 className="mb-6 text-xl font-semibold text-white">Welcome back</h2>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error ? (
          <div
            className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block text-xs font-medium uppercase tracking-wide text-gray-400"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-surface-darkest px-3 py-2.5 text-white placeholder:text-gray-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-xs font-medium uppercase tracking-wide text-gray-400"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-surface-darkest px-3 py-2.5 text-white placeholder:text-gray-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="••••••••"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-dark"
        >
          {isSubmitting ? "Signing in…" : "Log In"}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-3 text-center text-sm">
        <Link
          to="/forgot-password"
          className="text-primary hover:underline focus:outline-none focus-visible:underline"
        >
          Forgot your password?
        </Link>
        <p className="text-gray-400">
          Need an account?{" "}
          <Link
            to="/register"
            className="font-medium text-primary hover:underline focus:outline-none focus-visible:underline"
          >
            Register
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
