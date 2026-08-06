import { Check, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { useFakeCheckout } from '@/hooks/use-premium'

/** Only what premium actually changes — everything else is free and stays free. */
const PERKS = [
  'Foto dei pasti senza limiti giornalieri',
  'Nessuna attesa quando finisci le foto gratuite',
  'Sostieni lo sviluppo dell’app',
]

/**
 * The paywall. Nothing behind the button charges anything: it calls
 * /api/premium/checkout, which flips a flag on the account and answers — see
 * routes/premium.ts. The screen is shaped like a checkout so the flow can be
 * walked through end to end before a payment provider is chosen, and the copy
 * says so rather than pretending otherwise.
 */
export function PremiumSheet({
  open,
  onOpenChange,
  used,
  limit,
  onUnlocked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Photos already analysed in the window, for the "3 su 3" line. */
  used?: number
  limit?: number | null
  /** Fired once the account is premium, so the caller can retry what it wanted. */
  onUnlocked?: () => void
}) {
  const checkout = useFakeCheckout()

  const pay = () => {
    checkout.mutate(undefined, {
      onSuccess: () => {
        toast.success('Premium attivo')
        onOpenChange(false)
        onUnlocked?.()
      },
      onError: () => toast.error('Attivazione non riuscita. Riprova.'),
    })
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!checkout.isPending) onOpenChange(next)
      }}
    >
      <DrawerContent className="mx-auto max-h-[94dvh] max-w-[440px] rounded-t-[28px]">
        <DrawerHeader className="shrink-0">
          <DrawerTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" strokeWidth={2.4} />
            Calorico Premium
          </DrawerTitle>
          <DrawerDescription>
            {typeof limit === 'number'
              ? `Hai usato ${used ?? limit} foto su ${limit} nelle ultime 24 ore.`
              : 'Analisi delle foto senza limiti giornalieri.'}
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-4 px-4 pb-8">
          <ul className="space-y-2">
            {PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-2 text-sm font-medium">
                <Check
                  className="text-primary mt-0.5 size-4 shrink-0"
                  strokeWidth={3}
                />
                {perk}
              </li>
            ))}
          </ul>

          <Button
            type="button"
            onClick={pay}
            disabled={checkout.isPending}
            className="min-h-14 w-full gap-2 rounded-[20px] text-sm font-bold"
          >
            {checkout.isPending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Sparkles className="size-5" strokeWidth={2.4} />
            )}
            {checkout.isPending ? 'Attivo…' : 'Paga 2,99 €/mese'}
          </Button>

          <p className="text-muted-foreground px-1 text-[11px] font-medium">
            Nessun pagamento viene richiesto: i pagamenti non sono ancora
            collegati, quindi questo pulsante attiva Premium gratis. Puoi
            disattivarlo dal tuo profilo.
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
