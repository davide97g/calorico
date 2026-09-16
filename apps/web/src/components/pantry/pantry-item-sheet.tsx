import { useEffect, useState } from 'react'
import { PackageX, Trash2 } from 'lucide-react'
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
import { useDeletePantryItem, useUpdatePantryItem } from '@/hooks/use-pantry'
import { grams } from '@/lib/format'
import type { PantryItem } from '@/lib/types'

/**
 * Correcting the cupboard by hand — the jar thrown away half full, the pack
 * somebody opened without logging a bite.
 *
 * "Finito" is the button this sheet exists for: it is the honest answer when
 * the count has drifted, and it puts the product on the shopping list exactly
 * as running it down would have.
 */
export function PantryItemSheet({
  item,
  onOpenChange,
}: {
  item: PantryItem | null
  onOpenChange: (open: boolean) => void
}) {
  const updateItem = useUpdatePantryItem()
  const deleteItem = useDeletePantryItem()
  const [sealed, setSealed] = useState('0')
  const [remaining, setRemaining] = useState('0')

  useEffect(() => {
    setSealed(String(item?.sealedPackages ?? 0))
    setRemaining(String(item?.remainingG ?? 0))
  }, [item])

  if (!item) return null

  const save = (patch: { sealedPackages: number; remainingG: number }) =>
    updateItem.mutate(
      { id: item.id, ...patch },
      {
        onError: () => toast.error('Dispensa non aggiornata'),
        onSuccess: () => onOpenChange(false),
      },
    )

  const sealedValue = Number(sealed)
  const remainingValue = Number(remaining.replace(',', '.'))
  const valid =
    Number.isFinite(sealedValue) &&
    sealedValue >= 0 &&
    sealedValue <= 99 &&
    Number.isFinite(remainingValue) &&
    remainingValue >= 0 &&
    remainingValue <= 20_000

  return (
    <Drawer open onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="truncate">{item.name}</DrawerTitle>
          <DrawerDescription>
            Confezione da {grams(item.packageSizeG)} g · in casa{' '}
            {grams(item.totalG)} g
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs font-medium">
                Confezioni chiuse
              </span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                value={sealed}
                onChange={(event) => setSealed(event.target.value)}
                className="h-11 rounded-md"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs font-medium">
                Aperta (g)
              </span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={20000}
                value={remaining}
                onChange={(event) => setRemaining(event.target.value)}
                className="h-11 rounded-md"
              />
            </label>
          </div>

          <Button
            type="button"
            className="rounded-full"
            disabled={!valid || updateItem.isPending}
            onClick={() =>
              save({
                sealedPackages: Math.round(sealedValue),
                remainingG: remainingValue,
              })
            }
          >
            Salva
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="rounded-full"
            disabled={updateItem.isPending}
            onClick={() => save({ sealedPackages: 0, remainingG: 0 })}
          >
            <PackageX /> È finito, mettilo nella spesa
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="text-destructive rounded-full"
            onClick={() =>
              deleteItem.mutate(item.id, {
                onSuccess: () => {
                  toast.success(`${item.name} non è più tracciato`)
                  onOpenChange(false)
                },
                onError: () => toast.error('Rimozione non riuscita'),
              })
            }
          >
            <Trash2 /> Smetti di tracciarlo
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
