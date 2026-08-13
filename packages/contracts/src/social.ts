import { z } from 'zod'
import { personRef, scanKind, timestamp } from './primitives.js'

/**
 * The shared surfaces: a grocery list and a scan feed, both of which can belong
 * to a family rather than to one person. See lib/family.ts on the server for
 * which list a write lands in.
 */

export const groceryItem = z.object({
  id: z.string(),
  userId: z.string(),
  /** Null on a private list; set once the row belongs to a family. */
  familyId: z.string().nullable(),
  foodId: z.string().nullable(),
  dedupeKey: z.string(),
  nameSnapshot: z.string(),
  brandSnapshot: z.string().nullable(),
  quantity: z.number(),
  completed: z.boolean(),
  completedAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  /** Absent only on the optimistic row a mutation writes before the response. */
  addedBy: personRef.optional(),
})
export type GroceryItem = z.infer<typeof groceryItem>

export const groceryResponse = z.object({ items: z.array(groceryItem) })
export type GroceryResponse = z.infer<typeof groceryResponse>

/** A line the list has held before, offered back while typing. */
export const grocerySuggestion = z.object({
  key: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  foodId: z.string().nullable(),
  times: z.number(),
  lastAt: timestamp,
  score: z.number(),
})
export type GrocerySuggestion = z.infer<typeof grocerySuggestion>

export const grocerySuggestionsResponse = z.object({
  items: z.array(grocerySuggestion),
})
export type GrocerySuggestionsResponse = z.infer<
  typeof grocerySuggestionsResponse
>

export const familyMember = personRef.extend({ joinedAt: timestamp })
export type FamilyMember = z.infer<typeof familyMember>

export const family = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: timestamp,
  joinedAt: timestamp,
  members: z.array(familyMember),
})
export type Family = z.infer<typeof family>

export const familiesResponse = z.object({
  families: z.array(family),
  /** Where this user's new shared rows land. */
  activeFamilyId: z.string().nullable(),
})
export type FamiliesResponse = z.infer<typeof familiesResponse>

export const familyInvite = z.object({
  id: z.string(),
  familyId: z.string(),
  token: z.string(),
  expiresAt: timestamp,
  revokedAt: timestamp.nullable(),
  createdAt: timestamp,
})
export type FamilyInvite = z.infer<typeof familyInvite>

/** What an invite link shows before anyone is asked to sign in. */
export const invitePreview = z.object({
  id: z.string(),
  familyId: z.string(),
  familyName: z.string(),
  expiresAt: timestamp,
  memberCount: z.number(),
  alreadyMember: z.boolean(),
})
export type InvitePreview = z.infer<typeof invitePreview>

/**
 * One scanned item, not one scan: the API folds every scan of the same product
 * into a single row ranked by how often and how recently it comes up.
 */
export const scanHistoryItem = z.object({
  /** Stable per item, not per scan — safe as a list key, useless as a row id. */
  key: z.string(),
  kind: scanKind,
  foodId: z.string().nullable(),
  barcode: z.string().nullable(),
  nameSnapshot: z.string(),
  brandSnapshot: z.string().nullable(),
  /** Photo scans only: what the model saw. Never nutrition figures. */
  items: z
    .array(z.object({ label: z.string(), quantityG: z.number() }))
    .nullable(),
  /** How many times this item was scanned, ever. */
  times: z.number(),
  lastAt: timestamp,
  /** Frequency and recency in one number; the order the list arrives in. */
  score: z.number(),
  scannedBy: personRef,
})
export type ScanHistoryItem = z.infer<typeof scanHistoryItem>

export const scansResponse = z.object({
  items: z.array(scanHistoryItem),
  /** Offset to ask for next, or null at the end — the order is a score, not a clock. */
  nextOffset: z.number().nullable(),
})
export type ScansResponse = z.infer<typeof scansResponse>
