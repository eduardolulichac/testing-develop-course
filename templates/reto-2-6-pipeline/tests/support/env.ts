/** Lee una variable de entorno o dice qué falta (en local viene de `.env`; en el evaluador la pone él). */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name}: copia .env.example como .env`);
  return value;
}
