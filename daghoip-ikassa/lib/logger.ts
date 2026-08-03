/**
 * Journalisation structurée minimaliste (JSON en production, lisible en dev).
 *
 * Les valeurs potentiellement sensibles (mot de passe, jeton, e-mail complet)
 * sont masquées avant écriture.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = /password|token|secret|authorization|apikey|service_role/i;

function redact(context: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    safe[key] = SENSITIVE_KEYS.test(key) ? '[redacted]' : value;
  }
  return safe;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }

  // Les erreurs Supabase / PostgREST sont des objets simples (message, code,
  // details, hint) : `String(error)` donnerait « [object Object] ».
  if (typeof error === 'object' && error !== null) {
    const { message, code, details, hint } = error as Record<string, unknown>;
    return { message, code, details, hint };
  }

  return { value: String(error) };
}

function write(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...redact(context),
  };

  const line =
    process.env.NODE_ENV === 'production' ? JSON.stringify(payload) : `[${level}] ${message}`;

  if (level === 'error') console.error(line, process.env.NODE_ENV === 'production' ? '' : payload);
  else if (level === 'warn') console.warn(line);
  else if (level === 'debug' && process.env.NODE_ENV !== 'development') return;
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, error?: unknown, context?: Record<string, unknown>) =>
    write('error', message, { ...context, error: serializeError(error) }),
};
