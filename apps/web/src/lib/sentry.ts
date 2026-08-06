/**
 * Browser error tracking, off unless VITE_SENTRY_DSN was set at build time.
 *
 * The SDK is imported dynamically, not at the top of the module: it is ~120 KB
 * gzipped, and a deploy with no DSN must not make every visitor download it. With
 * a DSN it loads in the background right after first paint.
 *
 * A browser DSN is public by nature — it ends up in the bundle — which is why it
 * is a separate value from the API's, and why the SDK is initialised with as
 * little as possible: no session replay, no tracing, no automatic PII. A calorie
 * diary is health data and none of it belongs in an error report.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  void import('@sentry/react')
    .then(({ init }) => {
      init({
        dsn,
        environment:
          import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        /** The bearer token must not ride along in a report. */
        beforeSend(event) {
          if (event.request?.headers) delete event.request.headers.authorization
          return event
        },
      })
    })
    .catch(() => {
      // Error tracking failing to load is not worth an error.
    })
}
