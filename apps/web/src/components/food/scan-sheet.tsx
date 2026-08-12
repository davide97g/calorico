import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { BarcodeScanner } from '@/components/food/barcode-scanner'
import { useBarcodeLookup } from '@/hooks/use-diary'
import { useAddGroceryItem, useGroceryOffer } from '@/hooks/use-grocery'
import { ApiError } from '@/lib/api'
import { todayISO } from '@/lib/date'
import { currentMeal } from '@/lib/format'
import type { Meal } from '@/lib/types'

interface ScanSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  day?: string
  meal?: Meal
}

/**
 * Barcode lookup with its own state, so any screen can open the camera without
 * routing through the search page first. Scanning is for a product the app has
 * not seen before — a food already logged is one tap away in the quick-log
 * sheet — so it is worth one tap from wherever the user happens to be.
 */
export function ScanSheet({ open, onOpenChange, day, meal }: ScanSheetProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const lookup = useBarcodeLookup()
  const addGroceryItem = useAddGroceryItem()
  const offerGrocery = useGroceryOffer()

  const handleDetected = (code: string) => {
    lookup.mutate(code, {
      onSuccess: async (food) => {
        onOpenChange(false)

        // Scanning from the shopping list is a request to put it on the list.
        if (location.pathname === '/grocery') {
          try {
            await addGroceryItem.mutateAsync({ foodId: food.id })
            toast.success(`${food.name} aggiunto alla spesa`)
          } catch {
            toast.error('Aggiunta alla spesa non riuscita')
          }
          return
        }

        const d = day ?? todayISO()
        const m = meal ?? currentMeal()
        navigate(`/food/${food.id}?day=${d}&meal=${m}`)
        offerGrocery(food, 'Scegli la porzione e salva.')
      },
      onError: (err) => {
        const notFound =
          err instanceof ApiError && err.code === 'product_not_found'
        toast.error(
          err instanceof ApiError
            ? err.message
            : 'Ricerca del codice a barre non riuscita',
          {
            description: notFound
              ? 'Cercalo per nome oppure crealo a mano.'
              : undefined,
            action: notFound
              ? {
                  label: 'Cerca',
                  onClick: () => {
                    onOpenChange(false)
                    navigate(`/add?day=${day ?? todayISO()}`)
                  },
                }
              : undefined,
          },
        )
      },
    })
  }

  return (
    <BarcodeScanner
      open={open}
      onOpenChange={onOpenChange}
      onDetected={handleDetected}
      isLoading={lookup.isPending}
    />
  )
}
