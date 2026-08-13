import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type {
  BreakdownResponse,
  DayStats,
  PeriodsResponse,
  PeriodUnit,
  StatsResponse,
} from '@/lib/types'

/**
 * The read side of the Analisi tab. Every hook here is a plain query with no
 * mutation of its own: what a chart shows only changes when the diary does, and
 * the diary's mutations invalidate `queryKeys.stats.all`.
 */

export function useStats(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.stats.daily(from, to),
    queryFn: () => api<StatsResponse>('/stats/daily', { query: { from, to } }),
    placeholderData: keepPreviousData,
  })
}

/**
 * One day in full: its meals, its biggest contributors, and the three figures
 * that give a day's calories a meaning — yesterday, the last week, and what this
 * weekday usually looks like.
 */
export function useDayStats(day: string) {
  return useQuery({
    queryKey: queryKeys.stats.day(day),
    queryFn: () => api<DayStats>('/stats/day', { query: { day } }),
    placeholderData: keepPreviousData,
  })
}

/** The same diary folded into weeks or months, newest bucket last. */
export function usePeriodStats(unit: PeriodUnit, from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.stats.periods(unit, from, to),
    queryFn: () =>
      api<PeriodsResponse>('/stats/periods', { query: { unit, from, to } }),
    placeholderData: keepPreviousData,
  })
}

/** Meals, weekdays, top foods and streaks over one range. */
export function useBreakdown(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.stats.breakdown(from, to),
    queryFn: () =>
      api<BreakdownResponse>('/stats/breakdown', { query: { from, to } }),
    enabled,
    placeholderData: keepPreviousData,
  })
}
