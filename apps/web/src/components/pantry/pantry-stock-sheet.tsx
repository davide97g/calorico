import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStockPantryItem } from '@/hooks/use-pantry'
import type { Food } from '@/lib/types'

/**
 * Putting a product in the cupboard.
 *
 * The package size is asked for whenever the catalogue has none, which is most
 * of what the supermarket's own label answers with — roughly three Tosano
 * products in four carry no nutrition table and no weight. Refusing to track
 * those would leave out exactly the things a household buys every week, so the
 * question is asked once and the answer is kept on the row.
 */
export function PantryStockSheet({
  food,
  onOpenChange,
}: {
  food: Food | null
  onOpenChange: (open: boolean) => void
}) {
  const stock = useStockPantryItem()
  const [packages, setPackages] = useState('1')
  const [size, setSize] = useState('')

  useEffect(() => {
    setPackages('1')
    setSize(food?.packageSizeG ? String(food.packageSizeG) : '')
  }, [food])

  if (!food) return null

  const needsSize = food.packageSizeG == null
  const sizeValue = Number(size.replace(',', '.'))
  const packagesValue = Number(packages)
  const valid =
    Number.isFinite(packagesValue) &&
    packagesValue >= 1 &&
    packagesValue <= 99 &&
    (!needsSize || (Number.isFinite(sizeValue) && sizeValue >= 1 && sizeValue <= 20_000))

  const submit = () => {
    if (!valid) return
    stock.mutate(
      {
        foodId: food.id,
        packages: Math.round(packagesValue),
        ...(needsSize ? { packageSizeG: sizeValue } : {}),
      },
      {
        onSuccess: () => {
          toast.success(`${food.name} è in dispensa`)
          onOpenChange(false)
        },
        onError: () => toast.error('Non è stato possibile aggiornare la dispensa'),
      },
    )
  }

  return (
    <Drawer open onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="truncate">{food.name}</DrawerTitle>
          <DrawerDescription>
            Quando lo mangi, la dispensa scala i grammi. Quando sta per finire,
            finisce da solo nella lista della spesa.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Confezioni
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={packages}
              onChange={(event) => setPackages(event.target.value)}
              className="h-11 rounded-md"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Peso della confezione (g)
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min={1}
              max={20000}
              value={size}
              disabled={!needsSize}
              onChange={(event) => setSize(event.target.value)}
              placeholder="400"
              className="h-11 rounded-md"
            />
            {needsSize ? (
              <span className="text-muted-foreground text-micro">
                Il catalogo non lo sa: leggilo dall’etichetta, si chiede una
                volta sola.
              </span>
            ) : null}
          </label>

          <Button
            type="button"
            className="rounded-full"
            disabled={!valid || stock.isPending}
            onClick={submit}
          >
            Metti in dispensa
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
