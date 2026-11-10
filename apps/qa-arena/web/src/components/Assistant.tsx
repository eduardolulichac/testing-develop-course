import { useState, type FormEvent } from "react";
import { api } from "../api";

interface Msg {
  from: "user" | "bot";
  text: string;
}

export function Assistant() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message) return;
    setText("");
    setMsgs((m) => [...m, { from: "user", text: message }]);
    try {
      const r = await api<{ reply: string }>("POST", "/api/assistant/chat", { message });
      setMsgs((m) => [...m, { from: "bot", text: r.reply }]);
    } catch {
      setMsgs((m) => [...m, { from: "bot", text: "El asistente no esta disponible." }]);
    }
  }

  return (
    <aside className="assistant" aria-label="Asistente de compras">
      <button data-testid="assistant-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        Asistente
      </button>
      {open && (
        <div className="card" data-testid="assistant-panel">
          <ul data-testid="assistant-messages" aria-live="polite">
            {msgs.map((m, i) => (
              <li key={i} className={m.from} data-testid={`assistant-msg-${m.from}`}>
                {m.text}
              </li>
            ))}
          </ul>
          <form onSubmit={send}>
            <input
              data-testid="assistant-input"
              aria-label="Mensaje"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" data-testid="assistant-send">
              Enviar
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
