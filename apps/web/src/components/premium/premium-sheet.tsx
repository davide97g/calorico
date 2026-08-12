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
import { useCheckout, usePremium } from '@/hooks/use-premium'

/** Only what premium actually changes — everything else is free and stays free. */
const PERKS = [
  'Foto dei pasti senza limiti',
  'Riconosce piatto, ingredienti e quantità in pochi secondi',
  'Sostieni lo sviluppo dell’app',
]

/**
 * The paywall. The button opens Stripe Checkout in this same tab; the card is
 * entered on Stripe's page, never here, and the subscription is switched on by
 * the webhook that follows. Nothing in this component can unlock anything.
 */
export function PremiumSheet({
  open,
  onOpenChange,
  used,
  limit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Free photos already analysed, for the "1 su 1" line. */
  used?: number
  limit?: number | null
}) {
  const status = usePremium()
  const checkout = useCheckout()
  const price = status.data?.priceEur ?? 5
  const paymentsEnabled = status.data?.paymentsEnabled ?? true

  const pay = () => {
    checkout.mutate(undefined, {
      // The success path never runs: the browser has left for Stripe by then.
      onError: () => toast.error('Non riesco ad aprire il pagamento. Riprova.'),
    })
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!checkout.isPending) onOpenChange(next)
      }}
    >
      <DrawerContent className="mx-auto max-h-[94dvh] max-w-[440px] rounded-t-xl">
        <DrawerHeader className="shrink-0">
          <DrawerTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" strokeWidth={2.4} />
            Calorico Premium
          </DrawerTitle>
          <DrawerDescription>
            {typeof limit === 'number'
              ? `Hai usato ${used ?? limit} foto su ${limit} gratuite.`
              : 'Analisi delle foto senza limiti.'}
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

          {paymentsEnabled ? (
            <>
              <Button
                type="button"
                onClick={pay}
                disabled={checkout.isPending}
                className="min-h-14 w-full gap-2 rounded-lg text-sm font-bold"
              >
                {checkout.isPending ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Sparkles className="size-5" strokeWidth={2.4} />
                )}
                {checkout.isPending
                  ? 'Apro il pagamento…'
                  : `Abbonati a ${price},00 €/mese`}
              </Button>

              <p className="text-muted-foreground px-1 text-micro font-medium">
                Pagamento sicuro con Stripe: la carta viene inserita sul loro
                sito, non qui. Rinnovo mensile, disdici quando vuoi dal tuo
                profilo.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground px-1 text-micro font-medium">
              I pagamenti non sono attivi su questo server, quindi Premium non è
              acquistabile.
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
