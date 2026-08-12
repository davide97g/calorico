import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useCreateMeal } from '@/hooks/use-meals'
import { ApiError } from '@/lib/api'
import { MEAL_LABELS } from '@/lib/format'
import type { Meal } from '@/lib/types'

export function SaveMealDialog({
  open,
  onOpenChange,
  meal,
  items,
  defaultName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  meal: Meal
  items: { foodId: string; quantityG: number }[]
  defaultName: string
}) {
  const create = useCreateMeal()
  const [name, setName] = useState(defaultName)

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed || items.length === 0) return
    create.mutate(
      { name: trimmed, meal, items },
      {
        onSuccess: () => {
          toast.success(`Piatto salvato: ${trimmed}`)
          onOpenChange(false)
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError && err.code === 'too_many_meals'
              ? 'Hai raggiunto il numero massimo di piatti'
              : 'Salvataggio non riuscito',
          ),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setName(defaultName)
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-sm rounded-xl">
        <DialogHeader>
          <DialogTitle>Salva come piatto</DialogTitle>
          <DialogDescription>
            Lo ritrovi in un tap nella {MEAL_LABELS[meal].toLowerCase()}.
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">Nome</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="h-12 rounded-md"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
          />
        </label>
        <DialogFooter>
          <Button
            className="h-12 w-full rounded-full font-semibold"
            onClick={handleSave}
            disabled={!name.trim() || items.length === 0 || create.isPending}
          >
            Salva piatto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
