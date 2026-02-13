export type OnyxConfig = {
  base: string | null;
  apiKey: string | null;
  personaId: number;
  timeoutMs: number;
  errors: string[];
  isReady: boolean;
};

export function getOnyxConfig(): OnyxConfig {
  const errors: string[] = [];
  const baseRaw = process.env.ONYX_API_BASE_URL;
  const apiKeyRaw = process.env.ONYX_API_KEY;
  const personaRaw = process.env.ONYX_PERSONA_ID;
  const timeoutRaw = process.env.ONYX_TIMEOUT_MS;

  const apiKey = apiKeyRaw ? apiKeyRaw.trim() : null;
  let base = baseRaw ? baseRaw.trim() : null;

  // Auto-append /api if missing (handles user convenience)
  if (base && !base.endsWith('/api')) {
      base = base.endsWith('/') ? `${base}api` : `${base}/api`;
  }

  if (!base) errors.push('ONYX_API_BASE_URL is missing.');
  if (!apiKey) errors.push('ONYX_API_KEY is missing.');

  let personaId = 0;
  if (personaRaw !== undefined) {
    const parsed = parseInt(personaRaw, 10);
    if (Number.isNaN(parsed)) {
      errors.push('ONYX_PERSONA_ID must be a number.');
    } else {
      personaId = parsed;
    }
  }

  let timeoutMs = 20000;
  if (timeoutRaw !== undefined) {
    const parsed = parseInt(timeoutRaw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      errors.push('ONYX_TIMEOUT_MS must be a positive number.');
    } else {
      timeoutMs = parsed;
    }
  }

  return {
    base,
    apiKey,
    personaId,
    timeoutMs,
    errors,
    isReady: errors.length === 0,
  };
}
