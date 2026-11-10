import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth";
import { useMessages, useTestId } from "../scenario/ui-flags";

export function Login() {
  const { login, register } = useAuth();
  const tid = useTestId();
  const msg = useMessages();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card narrow">
      <h1>{mode === "login" ? "Iniciar sesion" : "Crear cuenta"}</h1>
      <form onSubmit={submit} data-testid="login-form">
        {mode === "register" && (
          <label>
            Nombre
            <input
              data-testid="register-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
        )}
        <label>
          Correo
          <input
            data-testid="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Contrasena
          <input
            data-testid="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p role="alert" className="error" data-testid="login-error">
            {msg(error)}
          </p>
        )}
        <button type="submit" className="primary" data-testid={tid("login-submit")} disabled={busy}>
          {mode === "login" ? "Entrar" : "Registrarme"}
        </button>
      </form>
      <button
        className="link"
        data-testid="login-toggle"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login" ? "No tengo cuenta" : "Ya tengo cuenta"}
      </button>
      <p className="hint" data-testid="login-hint">
        Practica: ana@arena.test / Cliente123! - admin@arena.test / Admin123!
      </p>
    </section>
  );
}
