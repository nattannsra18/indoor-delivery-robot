"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { logoutWithLocalTeardown } from "@/lib/authLifecycle";
import { UserIdentity } from "@/types";

type AuthValue = {
  user?: UserIdentity;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loseSession: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserIdentity>();
  const [loading, setLoading] = useState(true);
  const loseSession = useCallback(() => {
    setUser(undefined);
  }, []);
  useEffect(() => {
    let active = true;
    api.setUnauthorizedHandler(() => {
      if (active) loseSession();
    });
    api.getCurrentUser().then((value) => { if (active) setUser(value); })
      .catch(() => { if (active) setUser(undefined); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      api.setUnauthorizedHandler(undefined);
    };
  }, [loseSession]);
  async function login(identifier: string, password: string) {
    setUser(await api.login(identifier, password));
  }
  async function logout() {
    await logoutWithLocalTeardown(
      () => setUser(undefined),
      api.logout
    );
  }
  return <AuthContext.Provider value={{ user, loading, login, logout, loseSession }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
