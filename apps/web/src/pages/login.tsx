import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Panel } from '@/components/ui/panel'
import { useAuth } from '@/hooks/use-auth'
import { ApiError } from '@/lib/api'
import { AuthLayout } from './auth-layout'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPending(true)
    try {
      const res = await login(email, password)
      navigate(res.needsOnboarding ? '/onboarding' : '/', { replace: true })
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Accesso non riuscito',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout
      title="Bentornato"
      subtitle="Accedi per continuare a tracciare i tuoi pasti."
    >
      <Panel>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Email
            </span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="h-12 rounded-2xl"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Password
            </span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              minLength={8}
              className="h-12 rounded-2xl"
            />
          </label>

          <Button
            type="submit"
            className="mt-1 h-12 rounded-full text-base font-semibold"
            disabled={pending}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Accedi
          </Button>
        </form>
      </Panel>

      <p className="text-muted-foreground mt-4 text-center text-sm">
        Non hai un account?{' '}
        <Link to="/register" className="text-foreground font-semibold underline">
          Registrati
        </Link>
      </p>
    </AuthLayout>
  )
}
