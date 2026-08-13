/**
 * The contract between the API and the web app.
 *
 * Everything the API accepts or returns is described here once, as a zod schema,
 * and both apps take their types from it. That answers the question the previous
 * arrangement could not: *is the client's idea of a response still true?* The web
 * app infers `lib/types.ts` from these schemas, so it cannot disagree with them
 * silently, and the API's route tests parse real payloads through them, so a
 * changed response fails a test instead of a screen.
 *
 * Two kinds of schema live here, and the difference matters:
 *
 *   - **Request** schemas — `newFoodInput`, `bodyMetrics`, `batchEntryInput` and
 *     the primitives — are parsed by the API at the boundary. They carry
 *     constraints (`min`, `max`, `regex`, defaults), because they are the
 *     validation.
 *   - **Response** schemas describe what a handler sends. They are deliberately
 *     loose about constraints and precise about shape: a response is not
 *     validated in production, only in tests, where the question is whether the
 *     fields and their types still match.
 *
 * Response schemas do not reject unknown keys. Handlers legitimately send more
 * than a screen reads — row ids, timestamps — and a contract that broke every
 * time one appeared would be deleted within a week.
 *
 * A timestamp is a string here, because that is what a `timestamptz` becomes
 * once it has been through JSON. Server-side types (`Date`) belong to Drizzle,
 * not to the wire.
 */

export * from './primitives.js'
export * from './food.js'
export * from './diary.js'
export * from './stats.js'
export * from './weight.js'
export * from './meals.js'
export * from './social.js'
export * from './account.js'
export * from './vision.js'
export * from './notifications.js'
