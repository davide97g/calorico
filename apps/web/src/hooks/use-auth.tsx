import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getToken, setToken } from '@/lib/api'
import { unregisterDevice } from '@/hooks/use-notifications'
import type { AuthResponse, Profile, User } from '@/lib/types'

interface MeResponse {
  user: User
  profile: Profile | null
  needsOnboarding: boolean
}

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  needsOnboarding: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<AuthResponse>
  register: (
    name: string,
    email: string,
    password: string,
    consent: { healthConsent: true; ageAttested: true },
  ) => Promise<AuthResponse>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setTokenState] = useState<string | null>(() => getToken())

  // The api client fires this when a request comes back 401.
  useEffect(() => {
    const onUnauthorized = () => {
      setTokenState(null)
      queryClient.clear()
    }
    window.addEventListener('calorico:unauthorized', onUnauthorized)
    return () =>
      window.removeEventListener('calorico:unauthorized', onUnauthorized)
  }, [queryClient])

  const { data, isLoading } = useQuery({
    queryKey: ['me', token],
    queryFn: () => api<MeResponse>('/auth/me'),
    enabled: Boolean(token),
    staleTime: 60_000,
    retry: false,
  })

  const applyAuth = useCallback(
    (res: AuthResponse) => {
      setToken(res.token)
      setTokenState(res.token)
      return res
    },
    [],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data?.user ?? null,
      profile: data?.profile ?? null,
      needsOnboarding: data?.needsOnboarding ?? false,
      isLoading: Boolean(token) && isLoading,
      login: async (email, password) =>
        applyAuth(
          await api<AuthResponse>('/auth/login', {
            method: 'POST',
            body: { email, password },
          }),
        ),
      register: async (name, email, password, consent) =>
        applyAuth(
          await api<AuthResponse>('/auth/register', {
            method: 'POST',
            body: { name, email, password, ...consent },
          }),
        ),
      logout: () => {
        // Before the token goes: the reminder subscription is this browser's, so
        // leaving it registered would send the next account to sign in here the
        // previous one's reminders. Fire-and-forget — sign-out must not wait on
        // the network, and the request carries the token it still has.
        void unregisterDevice()
        setToken(null)
        setTokenState(null)
        queryClient.clear()
      },
    }),
    [applyAuth, data, isLoading, queryClient, token],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
