"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import AuthShell, { PasswordField } from "@/components/AuthShell";
import { useLocale } from "@/context/LocaleContext";
import { ApiError, signup } from "@/lib/api";
import { authText } from "@/lib/i18n";

const inputClass="min-h-12 rounded-xl border border-slate-300 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

export default function SignupPage() {
  const {locale}=useLocale();
  const copy=authText[locale];
  const [email,setEmail]=useState("");
  const [confirmEmail,setConfirmEmail]=useState("");
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [complete,setComplete]=useState(false);

  async function submit(event:FormEvent) {
    event.preventDefault();
    setError("");
    if(email.trim().toLocaleLowerCase()!==confirmEmail.trim().toLocaleLowerCase()){setError(copy.emailsMismatch);return;}
    if(password!==confirmPassword){setError(copy.passwordsMismatch);return;}
    setBusy(true);
    try { await signup({email,username,password}); setComplete(true); }
    catch(caught){setError(caught instanceof ApiError&&caught.status===409?copy.duplicateAccount:copy.requestFailed);}
    finally { setBusy(false); }
  }

  if(complete) return <AuthShell><div className="mx-auto max-w-md text-center">
    <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</span>
    <h1 className="mt-6 text-3xl font-bold text-slate-950">{copy.requestReceived}</h1>
    <p className="mt-3 text-sm leading-6 text-slate-500">{copy.requestReceivedDetail}</p>
    <Link href="/login" className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700">{copy.backToSignIn}</Link>
  </div></AuthShell>;

  return <AuthShell><div className="mx-auto max-w-md">
    <h1 className="text-3xl font-bold text-slate-950">{copy.signupTitle}</h1>
    <p className="mt-2 text-sm leading-6 text-slate-500">{copy.signupSubtitle}</p>
    <form onSubmit={submit} className="mt-7 grid gap-4">
      <label className="grid gap-2 text-sm font-semibold text-slate-800">{copy.email}<input type="email" autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} required className={inputClass}/></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-800">{copy.confirmEmail}<input type="email" autoComplete="email" value={confirmEmail} onChange={(event)=>setConfirmEmail(event.target.value)} required className={inputClass}/></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-800">{copy.username}<input autoComplete="username" pattern="[A-Za-z0-9_.-]+" minLength={3} value={username} onChange={(event)=>setUsername(event.target.value)} required className={inputClass}/><span className="text-xs font-normal text-slate-400">{copy.usernameHint}</span></label>
      <PasswordField label={copy.password} value={password} onChange={setPassword} autoComplete="new-password"/>
      <PasswordField label={copy.confirmPassword} value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password"/>
      {error&&<p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      <button disabled={busy} className="mt-1 min-h-12 rounded-xl bg-blue-600 px-4 font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50">{busy?copy.submitting:copy.submitRequest}</button>
    </form>
    <p className="mt-6 text-center text-sm text-slate-500">{copy.alreadyAccount} <Link href="/login" className="font-semibold text-blue-600">{copy.signIn}</Link></p>
  </div></AuthShell>;
}
