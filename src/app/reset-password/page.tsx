"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import AuthShell, { PasswordField } from "@/components/AuthShell";
import { useLocale } from "@/context/LocaleContext";
import { resetPassword } from "@/lib/api";
import { authText } from "@/lib/i18n";

export default function ResetPasswordPage(){
  const {locale}=useLocale();
  const copy=authText[locale];
  const [token,setToken]=useState("");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [complete,setComplete]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>setToken(new URLSearchParams(window.location.search).get("token")??""),[]);
  async function submit(event:FormEvent){event.preventDefault();setError("");if(!token){setError(copy.missingResetToken);return;}if(password!==confirm){setError(copy.passwordsMismatch);return;}setBusy(true);try{await resetPassword(token,password);setComplete(true);}catch{setError(copy.invalidReset);}finally{setBusy(false);}}
  return <AuthShell><div className="mx-auto max-w-md">
    <h1 className="text-3xl font-bold text-slate-950">{complete?copy.resetComplete:copy.resetTitle}</h1>
    <p className="mt-2 text-sm leading-6 text-slate-500">{complete?copy.resetCompleteDetail:copy.choosePasswordHelp}</p>
    {complete?<Link href="/login" className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 font-semibold text-white">{copy.backToSignIn}</Link>:<form onSubmit={submit} className="mt-7 grid gap-5">
      <PasswordField label={copy.newPassword} value={password} onChange={setPassword} autoComplete="new-password"/>
      <PasswordField label={copy.confirmPassword} value={confirm} onChange={setConfirm} autoComplete="new-password"/>
      {error&&<p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      <button disabled={busy} className="min-h-14 rounded-xl bg-blue-600 px-4 font-semibold text-white disabled:opacity-50">{busy?copy.updating:copy.updatePassword}</button>
    </form>}
  </div></AuthShell>;
}
