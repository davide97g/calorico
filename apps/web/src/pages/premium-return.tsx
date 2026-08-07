import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BrandLoader } from '@/components/ui/brand-loader'
import { usePremium, useSyncPremium } from '@/hooks/use-premium'

/** How long to keep asking before admitting the payment is still settling. */
const ATTEMPTS = 6
const EVERY_MS = 1500

/**
 * Where Stripe sends the browser after a successful checkout.
 *
 * The subscription is switched on by the webhook, which is a separate request
 * from Stripe to the API and may land a moment after the user is back here. So
 * this page asks, waits, asks again — and says so plainly rather than showing a
 * receipt for something that has not been confirmed yet.
 */
export default function PremiumReturnPage() {
  const navigate = useNavigate()
  const premium = usePremium()
  const sync = useSyncPremium()
  const [gaveUp, setGaveUp] = useState(false)

  const isPremium = premium.data?.isPremium ?? false
  // Through a ref so the polling effect below depends on the answer alone: it
  // owns its own repetition, and restarting it on every attempt would turn the
  // backoff into a loop with no end.
  const ask = useRef(sync.mutateAsync)
  ask.current = sync.mutateAsync

  useEffect(() => {
    if (isPremium) return
    let stopped = false

    const poll = async () => {
      for (let attempt = 1; attempt <= ATTEMPTS && !stopped; attempt += 1) {
        const status = await ask.current().catch(() => null)
        if (stopped || status?.isPremium) return
        await new Promise((resolve) => window.setTimeout(resolve, EVERY_MS))
      }
      if (!stopped) setGaveUp(true)
    }

    void poll()
    return () => {
      stopped = true
    }
  }, [isPremium])

  useEffect(() => {
    if (!isPremium) return
    toast.success('Premium attivo. Buone foto.')
    const timer = window.setTimeout(() => navigate('/', { replace: true }), 1200)
    return () => window.clearTimeout(timer)
  }, [isPremium, navigate])

  return (
    <div className="bg-background flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {isPremium ? (
        <>
          <Sparkles className="text-primary size-10" strokeWidth={2.2} />
          <h1 className="text-lg font-bold">Premium attivo</h1>
          <p className="text-muted-foreground text-sm">
            Le foto dei pasti non hanno più limiti. Ti riporto alla giornata.
          </p>
        </>
      ) : gaveUp ? (
        <>
          <h1 className="text-lg font-bold">Pagamento in corso</h1>
          <p className="text-muted-foreground text-sm">
            Stripe non ha ancora confermato l&apos;abbonamento. Di solito è
            questione di secondi: se hai pagato, Premium si attiva da solo.
          </p>
          <div className="flex gap-2">
            <Button
              disabled={sync.isPending}
              onClick={() =>
                sync.mutate(undefined, {
                  onSettled: (status) => {
                    if (!status?.isPremium) toast.info('Ancora nulla da Stripe.')
                  },
                })
              }
              className="rounded-full"
            >
              Controlla di nuovo
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate('/', { replace: true })}
              className="rounded-full"
            >
              Torna alla giornata
            </Button>
          </div>
        </>
      ) : (
        <>
          <BrandLoader label="Confermo il pagamento" />
          <p className="text-muted-foreground text-sm">
            Un istante: sto aspettando la conferma di Stripe.
          </p>
        </>
      )}
    </div>
  )
}
