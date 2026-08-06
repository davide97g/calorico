import type { FastifyBaseLogger } from 'fastify'
import { db } from '../db/index.js'
import { scanEvents, type NewScanEvent } from '../db/schema.js'
import { resolveWriteFamilyId } from './family.js'

/**
 * Records a scan into the family feed. Best-effort on purpose: the scan itself
 * already succeeded for the user, and losing a feed row is never a reason to
 * fail their lookup.
 */
export async function recordScan(
  userId: string,
  event: Omit<NewScanEvent, 'userId' | 'familyId'>,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    const familyId = await resolveWriteFamilyId(userId)
    await db.insert(scanEvents).values({ ...event, userId, familyId })
  } catch (err) {
    log.warn({ err }, 'failed to record scan event')
  }
}
