import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore, type User } from "./api";

interface AuthValue {
  user: User | null;
  ready: boolean;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    api<User>("GET", "/api/auth/me")
      .then(setUser)
      .catch(() => tokenStore.set(null))
      .finally(() => setReady(true));
  }, []);

  const finish = (r: { token: string; user: User }) => {
    tokenStore.set(r.token);
    setUser(r.user);
  };
  const login = useCallback(async (email: string, password: string) => {
    finish(await api("POST", "/api/auth/login", { email, password }));
  }, []);
  const register = useCallback(async (name: string, email: string, password: string) => {
    finish(await api("POST", "/api/auth/register", { name, email, password }));
  }, []);
  const logout = useCallback(async () => {
    await api("POST", "/api/auth/logout").catch(() => undefined);
    tokenStore.set(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, ready, login, register, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}
