/**
 * Environment for the test run, applied before any test file imports env.ts —
 * which exits the process on a missing DATABASE_URL or a short JWT_SECRET.
 *
 * The database URL is deliberately only taken from TEST_DATABASE_URL. The route
 * tests truncate every table, and pointing them at the development database by
 * accident would wipe a real diary; with the variable unset those suites skip
 * themselves and only the pure unit tests run.
 */
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET ??= 'test-secret-long-enough-for-the-schema'
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://calorico:calorico@127.0.0.1:5432/calorico_test'
process.env.OFF_ENABLED = 'false'
// The stub provider answers from a fixture, so no vision request leaves the box.
process.env.VISION_PROVIDER = 'stub'
process.env.VISION_API_KEY = 'test'
process.env.VISION_MODEL = 'test'
// The quota tests run dozens of stubbed analyses; the per-IP burst guard is not
// what they are testing, and every request here comes from the same address.
process.env.VISION_MAX_PER_MINUTE = '10000'
process.env.SENTRY_DSN = ''
/**
 * A throwaway VAPID pair, so the notification routes are switched on. Valid
 * keys are needed because web-push validates their shape, but nothing is ever
 * sent: the scheduler tests pass their own sender, and the routes that would
 * deliver are only exercised with no device registered.
 */
process.env.VAPID_PUBLIC_KEY =
  'BKDKWmDhb6V_8Ura9KCL-sgYFXv9YsFGyRd4dOwnW2VzY4TRkxy--JZ2o-dAJmVmLOjNjT3xuB1t8-UCkmRREVg'
process.env.VAPID_PRIVATE_KEY = '35F5-YcVigqPmNmg1eZKr3b41lCB4N6tpYhJezbxgAo'
process.env.VAPID_SUBJECT = 'mailto:test@calorico.test'
