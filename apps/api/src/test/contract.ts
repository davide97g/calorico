import { expect } from 'vitest'
import type { z } from 'zod'

/**
 * Asserts a real response still matches the contract in `@calorico/contracts`,
 * from which the web app takes its types.
 *
 * This is the only thing standing between a changed payload and a client that
 * compiles against a lie. Responses are never validated in production — the cost
 * would buy nothing, since the server is the one producing them — so the check
 * lives here, against payloads a handler actually sent.
 *
 * Unknown keys pass: handlers legitimately send more than a screen reads, and a
 * contract that failed every time a row id appeared would be deleted in a week.
 * What it catches is the opposite and the dangerous one — a field that has
 * vanished, been renamed, or changed type.
 *
 * Returns the parsed payload, so a test can carry on asserting values on
 * something already known to have the right shape.
 */
export function expectContract<Schema extends z.ZodType>(
  schema: Schema,
  payload: unknown,
): z.output<Schema> {
  const result = schema.safeParse(payload)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    expect.fail(
      `response does not match the contract:\n${issues}\n\n` +
        'Either the handler changed and the contract has to follow, or the ' +
        'handler broke. The web app types itself from the contract, so it ' +
        'cannot tell the difference.',
    )
  }
  return result.data
}
