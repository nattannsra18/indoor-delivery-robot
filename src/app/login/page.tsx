"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthShell, { PasswordField } from "@/components/AuthShell";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/context/LocaleContext";
import { ApiError, getGoogleAuthConfiguration, GOOGLE_AUTH_START_URL } from "@/lib/api";
import { authText } from "@/lib/i18n";

export default function LoginPage() {
  const {login} = useAuth();
  const {locale} = useLocale();
  const copy = authText[locale];
  const router = useRouter();
  const [identifier,setIdentifier] = useState("");
  const [password,setPassword] = useState("");
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [busy,setBusy] = useState(false);
  const [googleEnabled,setGoogleEnabled] = useState(false);

  useEffect(()=>{
    void getGoogleAuthConfiguration().then(({enabled})=>setGoogleEnabled(enabled)).catch(()=>setGoogleEnabled(false));
    const params = new URLSearchParams(window.location.search);
    if (params.get("status") === "pending") setNotice(copy.pendingApproval);
    if (params.get("error") === "google_failed") setError(copy.googleFailed);
  },[copy.googleFailed,copy.pendingApproval]);

  async function submit(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { await login(identifier,password); router.replace("/"); }
    catch (caught) {
      setError(caught instanceof ApiError && caught.status === 403 ? copy.pendingApproval : copy.invalidCredentials);
    } finally { setBusy(false); }
  }

  return <AuthShell>
    <div className="mx-auto max-w-md py-1 sm:py-2">
      <h1 className="text-4xl font-black tracking-[-0.035em] text-[#071536]">{copy.signInTitle}</h1>
      <p className="mt-2 text-base leading-7 text-slate-500">{copy.signInSubtitle}</p>
      <form onSubmit={submit} className="mt-9 grid gap-5">
        <label className="grid gap-2 text-sm font-semibold text-slate-800">{copy.identifier}
          <span className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-slate-400"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></span>
            <input autoComplete="username" value={identifier} onChange={(event)=>setIdentifier(event.target.value)} placeholder={copy.loginIdentifierPlaceholder} required className="min-h-14 w-full rounded-xl border border-slate-300 px-12 font-normal outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
          </span>
        </label>
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-800">{copy.password}</div>
          <PasswordField label="" value={password} onChange={setPassword} placeholder={copy.loginPasswordPlaceholder} />
          <div className="mt-3 text-right"><Link href="/forgot-password" className="text-sm font-semibold text-blue-600 hover:text-blue-800">{copy.forgotPassword}</Link></div>
        </div>
        {notice&&<p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" aria-live="polite">{notice}</p>}
        {error&&<p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        <button disabled={busy} className="flex min-h-14 items-center justify-center gap-5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 font-semibold text-white shadow-lg shadow-blue-200 transition hover:from-blue-700 hover:to-blue-600 disabled:opacity-50"><span>{busy?copy.signingIn:copy.signIn}</span><span aria-hidden="true" className="text-xl">→</span></button>
      </form>
      {googleEnabled&&<><div className="my-6 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200"/><span>{copy.orContinue}</span><span className="h-px flex-1 bg-slate-200"/></div><a href={GOOGLE_AUTH_START_URL} className="flex min-h-12 items-center justify-center gap-3 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"><span className="grid h-6 w-6 place-items-center rounded-full border border-slate-200 bg-white font-bold text-blue-600">G</span>{copy.google}</a></>}
      <div className="mt-7 flex items-center gap-4 text-center text-sm text-slate-500"><span className="h-px flex-1 bg-slate-200"/><p>{copy.noAccount} <Link href="/signup" className="font-semibold text-blue-600 hover:text-blue-800">{copy.createAccount}</Link></p><span className="h-px flex-1 bg-slate-200"/></div>
    </div>
  </AuthShell>;
}
