"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AuthState = "idle" | "password" | "code-sent" | "code-verify";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<AuthState>("idle");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading("password");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    setLoading("");

    if (!res.ok) {
      setError(data.error || "Login failed");
      return;
    }

    router.push("/dashboard");
  }

  async function handleSendCode() {
    setError("");
    setLoading("send-code");

    const res = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    setLoading("");

    if (!res.ok) {
      setError(data.error || "Failed to send code");
      return;
    }

    setMessage("Code sent! Check your email.");
    setState("code-verify");
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading("verify");

    const res = await fetch("/api/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    const data = await res.json();
    setLoading("");

    if (!res.ok) {
      setError(data.error || "Verification failed");
      return;
    }

    router.push("/dashboard");
  }

  function handleOAuth(provider: string) {
    setLoading(provider);
    window.location.href = `/api/auth/signin/${provider}?callbackUrl=/dashboard`;
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Log in to TeamMCP</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose a sign-in method</p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        {message && (
          <div className="rounded-md bg-success/10 p-3 text-sm text-success">{message}</div>
        )}

        {/* Email input — always visible unless verifying code */}
        {state !== "code-verify" && (
          <div className="space-y-3">
            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 block w-full rounded-md border border-input px-3 py-2 text-sm focus:border-ring focus:outline-none"
              />
            </div>

            {/* Password field — shown when user clicks "Sign in with password" */}
            {state === "password" && (
              <form onSubmit={handlePasswordLogin} className="space-y-3">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-input px-3 py-2 text-sm focus:border-ring focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!!loading || !email || !password}
                  className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading === "password" ? "Signing in..." : "Sign in"}
                </button>
                <button
                  type="button"
                  onClick={() => setState("idle")}
                  className="w-full text-sm text-muted-foreground hover:text-foreground"
                >
                  Back
                </button>
              </form>
            )}

            {/* Action buttons — shown in idle state */}
            {state === "idle" && (
              <div className="space-y-2">
                <button
                  onClick={() => setState("password")}
                  disabled={!email || !!loading}
                  className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Sign in with password
                </button>
                <button
                  onClick={handleSendCode}
                  disabled={!email || !!loading}
                  className="w-full rounded-md border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                >
                  {loading === "send-code" ? "Sending..." : "Send me a code"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Code verification */}
        {state === "code-verify" && (
          <form onSubmit={handleVerifyCode} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the 5-digit code sent to <strong>{email}</strong>
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="12345"
              className="block w-full rounded-md border border-input px-3 py-2 text-center text-2xl tracking-widest focus:border-ring focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              disabled={code.length !== 5 || !!loading}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading === "verify" ? "Verifying..." : "Verify code"}
            </button>
            <button
              type="button"
              onClick={() => {
                setState("idle");
                setCode("");
                setMessage("");
              }}
              className="w-full text-sm text-muted-foreground hover:text-foreground"
            >
              Back
            </button>
          </form>
        )}

        {/* Divider */}
        {state === "idle" && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            {/* OAuth providers */}
            <div className="space-y-3">
              <button
                onClick={() => handleOAuth("google")}
                disabled={!!loading}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {loading === "google" ? "Signing in..." : "Continue with Google"}
              </button>

              <button
                onClick={() => handleOAuth("github")}
                disabled={!!loading}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
                {loading === "github" ? "Signing in..." : "Continue with GitHub"}
              </button>
            </div>
          </>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an organization?{" "}
          <Link href="/signup" className="font-medium text-foreground hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
