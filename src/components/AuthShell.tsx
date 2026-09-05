"use client";

import React, { ReactNode } from "react";
import { LanguageSwitcher, useLocale } from "@/context/LocaleContext";
import { authText } from "@/lib/i18n";

function Brand() {
  const {locale}=useLocale();
  const copy=authText[locale];
  return <img src="/auth/delivery-robot-logo.png" alt={`${copy.productName} — ${copy.indoorSystem}`} className="h-auto w-[270px] max-w-[68vw]"/>;
}

function FeatureIcon({kind}:{kind:"delivery"|"realtime"|"people"}) {
  if(kind==="delivery") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/></svg>;
  if(kind==="realtime") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M14 15a5 5 0 0 1 7 4v1"/></svg>;
}

function Feature({icon,title,detail}:{icon:"delivery"|"realtime"|"people";title:string;detail:string}) {
  return <div className="flex items-center gap-4">
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-blue-200/80 bg-blue-50/90 text-blue-700 shadow-sm backdrop-blur"><FeatureIcon kind={icon}/></span>
    <div><p className="font-bold text-slate-950">{title}</p><p className="mt-0.5 text-sm text-slate-600">{detail}</p></div>
  </div>;
}

export default function AuthShell({children}:{children:ReactNode}) {
  const {locale}=useLocale();
  const copy=authText[locale];
  return <main className="min-h-screen bg-[#f7faff] text-slate-950">
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(520px,0.92fr)]">
      <section className="relative hidden min-h-screen overflow-hidden lg:block">
        <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url('/auth/campus-delivery-illustration.png')"}} />
        <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/78 to-white/10" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-white/40" />
        <div className="relative flex min-h-screen max-w-2xl flex-col px-10 py-9 xl:px-14 xl:py-12">
          <Brand />
          <div className="my-auto max-w-xl pb-20 pt-16">
            <p className="flex items-center gap-4 text-xs font-bold uppercase tracking-[0.28em] text-blue-600"><span className="h-0.5 w-10 bg-blue-600"/>{copy.heroEyebrow}</p>
            <h1 className="mt-7 text-5xl font-black leading-[1.05] tracking-[-0.04em] text-[#071536] xl:text-6xl">{copy.heroTitle}</h1>
            <p className="mt-5 max-w-lg text-lg leading-8 text-slate-600">{copy.heroSubtitle}</p>
            <div className="mt-10 grid gap-6">
              <Feature icon="delivery" title={copy.featureReliable} detail={copy.featureReliableDesc}/>
              <Feature icon="realtime" title={copy.featureRealtime} detail={copy.featureRealtimeDesc}/>
              <Feature icon="people" title={copy.featureInclusive} detail={copy.featureInclusiveDesc}/>
            </div>
          </div>
          <p className="text-sm font-medium tracking-wide text-slate-500">{copy.footerTagline}</p>
        </div>
      </section>

      <section className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_100%_35%,rgba(191,219,254,0.48),transparent_36%),linear-gradient(145deg,#ffffff_0%,#f7fbff_62%,#eef6ff_100%)] px-5 sm:px-8 lg:px-10 xl:px-14">
        <div aria-hidden="true" className="absolute -right-44 top-1/4 h-[34rem] w-[34rem] rounded-full border-[5rem] border-white/55" />
        <header className="absolute inset-x-5 top-5 z-10 flex items-center justify-between sm:inset-x-8 sm:top-8 lg:inset-x-10 lg:justify-end xl:inset-x-14">
          <div className="lg:hidden"><Brand /></div>
          <LanguageSwitcher variant="light" />
        </header>
        <div className="relative mx-auto flex min-h-screen w-full max-w-xl items-center py-28">
          <section className="w-full rounded-[1.75rem] border border-white/90 bg-white/90 p-6 shadow-[0_30px_90px_rgba(37,99,235,0.12)] backdrop-blur-xl sm:p-9 xl:p-11">
            {children}
          </section>
        </div>
        <p className="absolute bottom-7 right-8 hidden text-xs text-slate-400 sm:block xl:right-14">{copy.indoorSystem} <span className="ml-4 inline-block h-0.5 w-9 bg-blue-600 align-middle"/></p>
      </section>
    </div>
  </main>;
}

function EyeIcon({visible}:{visible:boolean}) {
  return visible
    ? <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
    : <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 18 18"/><path d="M10.6 6.2A11.7 11.7 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-2.1 2.8M6.6 6.6C3.6 8.4 2 12 2 12s3.5 6 10 6c1.8 0 3.3-.5 4.6-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>;
}

export function PasswordField({label,value,onChange,autoComplete="current-password",placeholder}:{label:string;value:string;onChange:(value:string)=>void;autoComplete?:string;placeholder?:string}) {
  const {locale}=useLocale();
  const copy=authText[locale];
  const [visible,setVisible]=React.useState(false);
  return <label className="grid gap-2 text-sm font-semibold text-slate-800">
    {label&&<span>{label}</span>}
    <span className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-slate-400"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>
      <input type={visible?"text":"password"} autoComplete={autoComplete} value={value} onChange={(event)=>onChange(event.target.value)} placeholder={placeholder} required className="min-h-14 w-full rounded-xl border border-slate-300 bg-white px-12 pr-14 font-normal outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
      <button type="button" onClick={()=>setVisible((current)=>!current)} className="absolute inset-y-1 right-1 grid w-11 place-items-center rounded-lg text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200" aria-label={visible?copy.hidePassword:copy.showPassword} title={visible?copy.hidePassword:copy.showPassword}><EyeIcon visible={visible}/></button>
    </span>
  </label>;
}
