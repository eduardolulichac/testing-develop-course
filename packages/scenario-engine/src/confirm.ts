/** Minimal HTTP client a confirmer uses; implemented over `app.inject` (tests) or `fetch`. */
export interface ArenaClient {
  request(
    method: string,
    path: string,
    o?: { body?: unknown; token?: string },
    // The body is whatever JSON the Arena returned; each confirmer narrows it itself.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ status: number; headers: Record<string, string>; body: any }>;
  login(email: string, password: string): Promise<string>;
  setScenario(id: string, release?: string): Promise<void>;
  reset(): Promise<void>;
}

/** Proves a scenario's defect is present (`present: true`) and says why. */
export type Confirmer = (c: ArenaClient) => Promise<{ present: boolean; evidence: string }>;
