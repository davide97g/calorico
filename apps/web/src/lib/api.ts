const TOKEN_KEY = 'calorico.token'

/** Empty in production: nginx proxies /api to the API container, same origin. */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message?: string) {
    super(message ?? code)
    this.status = status
    this.code = code
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Query params; undefined and null values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>
}

export async function api<T>(
  path: string,
  { body, query, headers, ...init }: RequestOptions = {},
): Promise<T> {
  const url = new URL(`${BASE}/api${path}`, window.location.origin)
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  }

  const token = getToken()
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 204) return undefined as T

  const payload = await res.json().catch(() => null)

  if (!res.ok) {
    // An expired or tampered token should drop the session, not loop forever.
    if (res.status === 401 && token) {
      setToken(null)
      window.dispatchEvent(new Event('calorico:unauthorized'))
    }
    const code = (payload as { error?: string })?.error ?? 'request_failed'
    throw new ApiError(res.status, code, errorMessage(code))
  }

  return payload as T
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email o password non corretti.',
  email_taken: 'Esiste già un account con questa email.',
  validation_error: 'Controlla i dati inseriti.',
  product_not_found: 'Prodotto non trovato su Open Food Facts.',
  off_unavailable:
    'Open Food Facts non risponde in questo momento. Riprova tra poco.',
  food_not_found: 'Alimento non trovato.',
  incomplete_profile: 'Completa prima il tuo profilo.',
  no_weight_logged: 'Registra prima un peso.',
  unauthorized: 'Sessione scaduta, accedi di nuovo.',
  vision_disabled: 'Il riconoscimento foto non è attivo su questo server.',
  vision_unavailable:
    'Non riesco ad analizzare la foto in questo momento. Riprova tra poco.',
  no_food_detected:
    'Non ho riconosciuto cibo nella foto. Prova a inquadrare meglio il piatto.',
  image_too_large: 'La foto è troppo pesante.',
  unsupported_media_type: 'Formato immagine non supportato.',
  internal_error: 'Qualcosa è andato storto. Riprova.',
}

export function errorMessage(code: string) {
  return MESSAGES[code] ?? 'Qualcosa è andato storto. Riprova.'
}
