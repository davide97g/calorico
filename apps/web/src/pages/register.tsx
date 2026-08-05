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

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [pending, setPending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPending(true)
    try {
      await register(form.name, form.email, form.password)
      navigate('/onboarding', { replace: true })
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Registrazione non riuscita',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout
      title="Crea il tuo account"
      subtitle="Prodotti dei supermercati italiani inclusi."
    >
      <Panel>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">Nome</span>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoComplete="name"
              required
              className="h-12 rounded-2xl"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Email
            </span>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
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
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
              autoComplete="new-password"
              required
              minLength={8}
              className="h-12 rounded-2xl"
            />
            <span className="text-muted-foreground text-[11px]">
              Almeno 8 caratteri.
            </span>
          </label>

          <Button
            type="submit"
            className="mt-1 h-12 rounded-full text-base font-semibold"
            disabled={pending}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Crea account
          </Button>
        </form>
      </Panel>

      <p className="text-muted-foreground mt-4 text-center text-sm">
        Hai già un account?{' '}
        <Link to="/login" className="text-foreground font-semibold underline">
          Accedi
        </Link>
      </p>
    </AuthLayout>
  )
}
