import type { Meal, PeriodUnit } from './types'

/**
 * Every React Query key the app uses, in one place.
 *
 * Two reasons it is not spread across the hooks that read it:
 *
 *   - Invalidation is prefix-based. `['stats']` invalidates every stats query,
 *     `['foods', id]` also reaches that food's images. That only works while the
 *     shapes are known to whoever writes the next mutation, and a literal typed
 *     inline in a fifth hook is exactly how a cache stops refreshing.
 *   - A stale screen after a mutation is close to invisible in review and
 *     obvious to a user. Keeping the keys together makes "what else does this
 *     touch?" a question the file answers.
 *
 * `all` members are the prefixes to invalidate; the functions build the exact
 * key a query subscribes to.
 */

/**
 * `all` also asks for the foods this user has only met — scanned, opened from
 * search, created by hand — which come without a portion. See lib/history.ts on
 * the server.
 */
export type RecentInclude = 'logged' | 'all'

export const queryKeys = {
  /** The signed-in account. Carries the token so a re-login refetches. */
  me: ['me'] as const,
  session: (token: string | null) => ['me', token] as const,

  diary: {
    all: ['diary'] as const,
    day: (day: string) => ['diary', day] as const,
  },

  stats: {
    all: ['stats'] as const,
    daily: (from: string, to: string) => ['stats', from, to] as const,
    day: (day: string) => ['stats', 'day', day] as const,
    periods: (unit: PeriodUnit, from: string, to: string) =>
      ['stats', 'periods', unit, from, to] as const,
    breakdown: (from: string, to: string) =>
      ['stats', 'breakdown', from, to] as const,
  },

  weight: ['weight'] as const,

  foods: {
    all: ['foods'] as const,
    search: (q: string) => ['foods', 'search', q] as const,
    searchAll: ['foods', 'search'] as const,
    detail: (id: string) => ['foods', id] as const,
    /** Under the food itself, so invalidating the food refreshes its gallery. */
    images: (id: string) => ['foods', id, 'images'] as const,
    recent: (meal?: Meal, include: RecentInclude = 'logged') =>
      ['foods', 'recent', meal ?? 'any', include] as const,
    recentAll: ['foods', 'recent'] as const,
    portions: (id: string) => ['foods', 'portions', id] as const,
    portionsAll: ['foods', 'portions'] as const,
    favorites: ['foods', 'favorites'] as const,
  },

  meals: {
    all: ['meals'] as const,
    list: (meal?: Meal) => ['meals', meal ?? 'any'] as const,
  },

  profile: {
    suggestedTargets: ['profile', 'suggested'] as const,
  },

  vision: {
    status: ['vision', 'status'] as const,
  },

  premium: ['premium'] as const,

  families: {
    all: ['families'] as const,
    invite: (familyId: string) => ['families', familyId, 'invite'] as const,
    /** Not under `families`: a preview is read before joining one. */
    preview: (token: string | undefined) => ['invite', token] as const,
  },

  grocery: {
    all: ['grocery'] as const,
    /**
     * Under `grocery` so every mutation's invalidation reaches it too: ticking a
     * row off or deleting it changes what deserves to be suggested.
     */
    suggestionsAll: ['grocery', 'suggestions'] as const,
    suggestions: (q: string) => ['grocery', 'suggestions', q] as const,
  },

  scans: {
    all: ['scans'] as const,
    list: (q: string) => ['scans', q] as const,
  },

  notifications: ['notifications'] as const,
}
