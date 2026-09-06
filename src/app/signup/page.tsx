"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import AuthShell, { PasswordField } from "@/components/AuthShell";
import { useLocale } from "@/context/LocaleContext";
import { ApiError, getPasswordPolicy, signup } from "@/lib/api";
import { authText } from "@/lib/i18n";
import { DEFAULT_PASSWORD_POLICY } from "@/lib/passwordPolicy";

const baseInputClass = "min-h-12 rounded-xl border px-4 font-normal outline-none transition focus:ring-4";

export default function SignupPage() {
  const { locale } = useLocale();
  const copy = authText[locale];
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [passwordPolicy, setPasswordPolicy] = useState(DEFAULT_PASSWORD_POLICY);

  useEffect(() => { getPasswordPolicy().then(setPasswordPolicy).catch(() => {}); }, []);

  const normalizedEmail = email.trim().toLocaleLowerCase();
  const normalizedConfirmEmail = confirmEmail.trim().toLocaleLowerCase();
  const normalizedUsername = username.trim();
  const emailValid = isValidEmail(normalizedEmail);
  const emailsMatch = Boolean(normalizedConfirmEmail) && normalizedEmail === normalizedConfirmEmail;
  const usernameLengthValid = normalizedUsername.length >= 3 && normalizedUsername.length <= 100;
  const usernameCharactersValid = /^[A-Za-z0-9_.-]+$/.test(normalizedUsername);
  const passwordLengthValid = password.length >= passwordPolicy.minimumLength;
  const passwordLetterValid = !passwordPolicy.requireLetter || /\p{L}/u.test(password);
  const passwordNumberValid = !passwordPolicy.requireNumber || /\d/.test(password);
  const passwordValid = passwordLengthValid && passwordLetterValid && passwordNumberValid;
  const passwordsMatch = Boolean(confirmPassword) && password === confirmPassword;
  const formValid = emailValid && emailsMatch && usernameLengthValid && usernameCharactersValid && passwordValid && passwordsMatch;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setError("");
    if (!formValid) {
      setError(copy.fixFields);
      return;
    }
    setBusy(true);
    try {
      await signup({ email: normalizedEmail, username: normalizedUsername, password });
      setComplete(true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) setError(copy.duplicateAccount);
      else if (caught instanceof ApiError && caught.status === 422) setError(copy.fixFields);
      else setError(copy.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  if (complete) return <AuthShell><div className="mx-auto max-w-md text-center">
    <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</span>
    <h1 className="mt-6 text-3xl font-bold text-slate-950">{copy.requestReceived}</h1>
    <p className="mt-3 text-sm leading-6 text-slate-500">{copy.requestReceivedDetail}</p>
    <Link href="/login" className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700">{copy.backToSignIn}</Link>
  </div></AuthShell>;

  return <AuthShell><div className="mx-auto max-w-md">
    <h1 className="text-3xl font-bold text-slate-950">{copy.signupTitle}</h1>
    <p className="mt-2 text-sm leading-6 text-slate-500">{copy.signupSubtitle}</p>
    <form onSubmit={submit} noValidate className="mt-7 grid gap-4">
      <Field label={copy.email} id="signup-email" error={(attempted || email.length > 0) && !emailValid ? (email ? copy.emailInvalid : copy.requiredField) : ""}>
        <input id="signup-email" type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder={copy.emailPlaceholder} required aria-invalid={((attempted || email.length > 0) && !emailValid) || undefined} aria-describedby="signup-email-feedback" className={inputClass((attempted || email.length > 0) && !emailValid)} />
      </Field>

      <Field label={copy.confirmEmail} id="signup-confirm-email" error={(attempted || confirmEmail.length > 0) && !emailsMatch ? (confirmEmail ? copy.emailsMismatch : copy.requiredField) : ""}>
        <input id="signup-confirm-email" type="email" autoComplete="email" value={confirmEmail} onChange={(event) => { setConfirmEmail(event.target.value); setError(""); }} placeholder={copy.confirmEmailPlaceholder} required aria-invalid={((attempted || confirmEmail.length > 0) && !emailsMatch) || undefined} aria-describedby="signup-confirm-email-feedback" className={inputClass((attempted || confirmEmail.length > 0) && !emailsMatch)} />
      </Field>

      <Field label={copy.username} id="signup-username" error={(attempted || username.length > 0) && (!usernameLengthValid || !usernameCharactersValid) ? (!username ? copy.requiredField : !usernameLengthValid ? copy.usernameLength : copy.usernameCharacters) : ""} hint={copy.usernameHint}>
        <input id="signup-username" autoComplete="username" value={username} onChange={(event) => { setUsername(event.target.value); setError(""); }} placeholder={copy.usernamePlaceholder} required aria-invalid={((attempted || username.length > 0) && (!usernameLengthValid || !usernameCharactersValid)) || undefined} aria-describedby="signup-username-feedback signup-username-hint" className={inputClass((attempted || username.length > 0) && (!usernameLengthValid || !usernameCharactersValid))} />
      </Field>

      <div>
        <PasswordField label={copy.password} value={password} onChange={(value) => { setPassword(value); setError(""); }} autoComplete="new-password" placeholder={copy.newPasswordPlaceholder} minLength={passwordPolicy.minimumLength} invalid={(attempted || password.length > 0) && !passwordValid} describedBy="signup-password-requirements" />
        <ul id="signup-password-requirements" className="mt-2 grid gap-1.5" aria-live="polite">
          <Requirement met={passwordLengthValid} active={password.length > 0} text={copy.passwordLength.replace("{count}", String(passwordPolicy.minimumLength))} />
          {passwordPolicy.requireLetter && <Requirement met={passwordLetterValid} active={password.length > 0} text={copy.passwordLetter} />}
          {passwordPolicy.requireNumber && <Requirement met={passwordNumberValid} active={password.length > 0} text={copy.passwordNumber} />}
        </ul>
      </div>

      <div>
        <PasswordField label={copy.confirmPassword} value={confirmPassword} onChange={(value) => { setConfirmPassword(value); setError(""); }} autoComplete="new-password" placeholder={copy.confirmPasswordPlaceholder} invalid={(attempted || confirmPassword.length > 0) && !passwordsMatch} describedBy="signup-confirm-password-feedback" />
        {(attempted || confirmPassword.length > 0) && !passwordsMatch && <p id="signup-confirm-password-feedback" className="mt-2 text-xs font-medium text-red-600">{confirmPassword ? copy.passwordsMismatch : copy.requiredField}</p>}
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      <button disabled={busy} className="mt-1 min-h-12 rounded-xl bg-blue-600 px-4 font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50">{busy ? copy.submitting : copy.submitRequest}</button>
    </form>
    <p className="mt-6 text-center text-sm text-slate-500">{copy.alreadyAccount} <Link href="/login" className="font-semibold text-blue-600">{copy.signIn}</Link></p>
  </div></AuthShell>;
}

function Field({ label, id, error, hint, children }: { label: string; id: string; error?: string; hint?: string; children: ReactNode }) {
  return <label htmlFor={id} className="grid gap-2 text-sm font-semibold text-slate-800">{label}{children}{error ? <span id={`${id}-feedback`} className="text-xs font-medium text-red-600" aria-live="polite">{error}</span> : hint ? <span id={`${id}-hint`} className="text-xs font-normal text-slate-500">{hint}</span> : null}</label>;
}

function Requirement({ met, active, text }: { met: boolean; active: boolean; text: string }) {
  return <li className={`flex items-center gap-2 text-xs ${met ? "font-medium text-emerald-700" : active ? "text-amber-700" : "text-slate-500"}`}><span aria-hidden="true" className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${met ? "bg-emerald-100" : "bg-slate-100"}`}>{met ? "✓" : "○"}</span>{text}</li>;
}

function inputClass(invalid: boolean) {
  return `${baseInputClass} ${invalid ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-slate-300 focus:border-blue-500 focus:ring-blue-100"}`;
}

function isValidEmail(value: string) {
  const separator = value.lastIndexOf("@");
  if (separator <= 0 || separator === value.length - 1 || /\s/.test(value)) return false;
  return value.slice(separator + 1).includes(".");
}
