"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import AuthShell from "@/components/AuthShell";
import { useLocale } from "@/context/LocaleContext";
import { forgotPassword } from "@/lib/api";
import { authText } from "@/lib/i18n";

export default function ForgotPasswordPage(){
  const {locale}=useLocale();
  const copy=authText[locale];
  const [email,setEmail]=useState("");
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<{delivery_configured:boolean}|null>(null);
  const [error,setError]=useState("");
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError("");try{setResult(await forgotPassword(email));}catch{setError(copy.requestFailed);}finally{setBusy(false);}}
  return <AuthShell><div className="mx-auto max-w-md">
    <h1 className="text-3xl font-bold text-slate-950">{result?copy.resetSent:copy.forgotTitle}</h1>
    <p className="mt-2 text-sm leading-6 text-slate-500">{result?copy.resetSentDetail:copy.forgotSubtitle}</p>
    {result?<>
      <div className={`mt-6 rounded-2xl border p-4 text-sm leading-6 ${result.delivery_configured?"border-emerald-200 bg-emerald-50 text-emerald-800":"border-amber-200 bg-amber-50 text-amber-800"}`}>{result.delivery_configured?copy.resetSentDetail:copy.emailNotConfigured}</div>
      <Link href="/login" className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 font-semibold text-white">{copy.backToSignIn}</Link>
    </>:<form onSubmit={submit} className="mt-7 grid gap-5">
      <label className="grid gap-2 text-sm font-semibold text-slate-800">{copy.email}<input type="email" autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} required className="min-h-14 rounded-xl border border-slate-300 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"/></label>
      {error&&<p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      <button disabled={busy} className="min-h-14 rounded-xl bg-blue-600 px-4 font-semibold text-white disabled:opacity-50">{busy?copy.sending:copy.sendReset}</button>
      <Link href="/login" className="text-center text-sm font-semibold text-blue-600">{copy.backToSignIn}</Link>
    </form>}
  </div></AuthShell>;
}
