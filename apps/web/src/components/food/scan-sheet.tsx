import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { BarcodeScanner } from '@/components/food/barcode-scanner'
import { useBarcodeLookup } from '@/hooks/use-diary'
import { useAddGroceryItem } from '@/hooks/use-grocery'
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
 * routing through the search page first. Scanning is the most used action in
 * the app; it should cost one tap from wherever the user happens to be.
 */
export function ScanSheet({ open, onOpenChange, day, meal }: ScanSheetProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const lookup = useBarcodeLookup()
  const addGroceryItem = useAddGroceryItem()

  const handleDetected = (code: string) => {
    lookup.mutate(code, {
      onSuccess: async (food) => {
        onOpenChange(false)
        try {
          await addGroceryItem.mutateAsync({ foodId: food.id })
          toast.success(`${food.name} aggiunto alla spesa`)
        } catch {
          toast.error('Scansione riuscita, ma aggiunta alla spesa non riuscita')
        }

        if (location.pathname !== '/grocery') {
          const d = day ?? todayISO()
          const m = meal ?? currentMeal()
          navigate(`/food/${food.id}?day=${d}&meal=${m}`)
        }
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
