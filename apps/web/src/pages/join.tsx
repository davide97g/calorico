import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { BrandLoader } from '@/components/ui/brand-loader'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { useAuth } from '@/hooks/use-auth'
import {
  setPendingInvite,
  useAcceptInvite,
  useInvitePreview,
} from '@/hooks/use-family'

/**
 * Deliberately outside RequireAuth: a link arriving from a chat is usually
 * opened by someone who is not signed in yet, and bouncing them to /login
 * would lose the token before anything could stash it.
 */
export default function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user, isLoading, needsOnboarding } = useAuth()
  const preview = useInvitePreview(token)
  const accept = useAcceptInvite()

  // Parked so the join survives register → onboarding → back here.
  useEffect(() => {
    if (token) setPendingInvite(token)
  }, [token])

  useEffect(() => {
    if (!isLoading && user && needsOnboarding) navigate('/onboarding', { replace: true })
  }, [isLoading, user, needsOnboarding, navigate])

  const handleAccept = () => {
    if (!token) return
    accept.mutate(token, {
      onSuccess: () => {
        toast.success('Ti sei unito alla famiglia')
        navigate('/grocery', { replace: true })
      },
      onError: () => toast.error('Non è stato possibile unirti'),
    })
  }

  const dismiss = () => {
    setPendingInvite(null)
    navigate('/', { replace: true })
  }

  if (isLoading || preview.isLoading) {
    return (
      <AppShell nav={false}>
        <div className="flex min-h-[60dvh] items-center justify-center">
          <BrandLoader />
        </div>
      </AppShell>
    )
  }

  if (preview.isError || !preview.data) {
    return (
      <AppShell nav={false}>
        <Panel className="mt-8 flex flex-col items-center px-6 py-10 text-center">
          <h1 className="text-base font-bold">Invito non valido</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Il link è scaduto o è stato disattivato. Chiedine uno nuovo.
          </p>
          <Button className="mt-5 w-full rounded-full" onClick={dismiss}>
            Chiudi
          </Button>
        </Panel>
      </AppShell>
    )
  }

  const { familyName, memberCount, alreadyMember } = preview.data

  return (
    <AppShell nav={false}>
      <Panel className="mt-8 flex flex-col items-center px-6 py-10 text-center">
        <span className="bg-primary/55 flex size-16 items-center justify-center rounded-lg">
          <Users className="text-primary-foreground size-7" />
        </span>
        <p className="text-primary-strong mt-4 text-micro font-bold tracking-[0.16em] uppercase">
          Invito
        </p>
        <h1 className="font-display mt-1 text-display-sm leading-tight font-bold">
          {familyName}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {memberCount} {memberCount === 1 ? 'membro' : 'membri'}
        </p>

        {alreadyMember ? (
          <>
            <p className="text-muted-foreground mt-4 text-sm">
              Fai già parte di questa famiglia.
            </p>
            <Button className="mt-5 w-full rounded-full" onClick={dismiss}>
              Vai alla spesa
            </Button>
          </>
        ) : !user ? (
          <>
            <p className="text-muted-foreground mt-4 text-sm">
              Accedi o crea un account per unirti. Torneremo qui subito dopo.
            </p>
            <Button asChild className="mt-5 w-full rounded-full">
              <Link to="/register">Crea un account</Link>
            </Button>
            <Button asChild variant="ghost" className="mt-2 w-full rounded-full">
              <Link to="/login">Ho già un account</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground mt-4 text-sm">
              Condividerete lista della spesa e scansioni. Il diario, le calorie
              e il peso restano privati. La tua lista attuale confluisce in
              quella di {familyName}.
            </p>
            <Button
              className="mt-5 w-full rounded-full"
              disabled={accept.isPending}
              onClick={handleAccept}
            >
              Unisciti
            </Button>
            <Button
              variant="ghost"
              className="mt-2 w-full rounded-full"
              onClick={dismiss}
            >
              Non ora
            </Button>
          </>
        )}
      </Panel>
    </AppShell>
  )
}
