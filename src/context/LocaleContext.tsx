"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { formatMessage, isLocale, Locale, messages } from "@/lib/i18n";

type Value={locale:Locale;setLocale:(locale:Locale)=>void;t:<K extends keyof typeof messages.en>(key:K)=>typeof messages.en[K];format:(template:string,values:Record<string,string|number>)=>string};
const Context=createContext<Value|null>(null);
const KEY="idr-locale";

export function LocaleProvider({children}:{children:ReactNode}) {
  const [locale,setCurrent]=useState<Locale>("en");
  useEffect(()=>{const saved=localStorage.getItem(KEY);if(isLocale(saved))setCurrent(saved);},[]);
  const setLocale=(next:Locale)=>{const safe=isLocale(next)?next:"en";localStorage.setItem(KEY,safe);setCurrent(safe);};
  useEffect(()=>{document.documentElement.lang=locale;},[locale]);
  const t=<K extends keyof typeof messages.en>(key:K)=>messages[locale][key] as typeof messages.en[K];
  return <Context.Provider value={{locale,setLocale,t,format:formatMessage}}>{children}</Context.Provider>;
}

export function useLocale(){const value=useContext(Context);if(!value)throw new Error("useLocale must be used within LocaleProvider");return value;}

function GlobeIcon(){return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>;}

export function LanguageSwitcher({variant="dark"}:{variant?:"dark"|"light"}){
  const {locale,setLocale,t}=useLocale();
  const light=variant==="light";
  const classes=light?"border-slate-200 bg-white text-slate-700 shadow-sm hover:border-blue-300 pl-10":"border-slate-600 bg-slate-900 text-slate-100";
  return <label className="relative flex items-center gap-2 text-sm">
    <span className="sr-only">{t("language")}</span>
    {light&&<span className="pointer-events-none absolute left-3 text-slate-500"><GlobeIcon/></span>}
    <select aria-label={t("language")} value={locale} onChange={(event)=>setLocale(isLocale(event.target.value)?event.target.value:"en")} className={`min-h-11 rounded-xl border px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${classes}`}><option value="en">English</option><option value="th">ไทย</option></select>
  </label>;
}
