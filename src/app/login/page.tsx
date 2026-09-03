"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await login(username, password); router.replace("/"); }
    catch { setError("Invalid username or password."); }
    finally { setBusy(false); }
  }
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Delivery Robot</h1>
        <p className="mt-2 text-sm text-slate-500">Sign in to the control center.</p>
        <label className="mt-6 grid gap-2 text-sm font-semibold">Username
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required className="rounded-xl border border-slate-300 px-4 py-3 font-normal" />
        </label>
        <label className="mt-4 grid gap-2 text-sm font-semibold">Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="rounded-xl border border-slate-300 px-4 py-3 font-normal" />
        </label>
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" aria-live="polite">{error}</p>}
        <button disabled={busy} className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
