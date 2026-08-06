/**
 * Prints a fresh VAPID key pair for the push reminders.
 *
 *   npm run vapid
 *
 * The public key ends up inside every browser subscription, so rotating the pair
 * invalidates every device already registered — they re-subscribe on their next
 * visit to the notifications screen, but until then they get nothing.
 *
 * Imported straight from web-push rather than through env.ts on purpose: this
 * script has to run before any of those variables exist.
 */
import webpush from 'web-push'

const { publicKey, privateKey } = webpush.generateVAPIDKeys()

console.log(`VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${privateKey}`)
console.log('VAPID_SUBJECT=mailto:you@example.com')
