import { useRef, useState } from 'react'
import { Camera, ImageOff, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useRemoveGroceryImage,
  useSetGroceryImage,
  useUpdateGroceryItem,
} from '@/hooks/use-grocery'
import { apiUrl } from '@/lib/api'
import {
  GROCERY_CATEGORY_LABELS,
  GROCERY_CATEGORY_ORDER,
  GROCERY_UNITS,
} from '@/lib/format'
import type { GroceryCategory, GroceryItem, GroceryUnit } from '@/lib/types'

const UNIT_HINTS: Record<GroceryUnit, string> = {
  pz: 'Pezzi',
  g: 'Grammi',
  kg: 'Chili',
  l: 'Litri',
  ml: 'Millilitri',
}

/**
 * Everything about one row that is not "buy it" or "done".
 *
 * It exists so the row itself can stay a row: on a phone, in a shop, the list
 * is read with a thumb and the only target that matters is the whole line. The
 * aisle, the unit and the photo are decisions made once, sitting down.
 */
export function GroceryItemSheet({
  item,
  imagesEnabled,
  onOpenChange,
  onDelete,
}: {
  item: GroceryItem | null
  imagesEnabled: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (item: GroceryItem) => void
}) {
  const updateItem = useUpdateGroceryItem()
  const setImage = useSetGroceryImage()
  const removeImage = useRemoveGroceryImage()
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  if (!item) return null

  const pickImage = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      await setImage.mutateAsync({ id: item.id, file })
    } catch {
      toast.error('Caricamento della foto non riuscito')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Drawer open onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="truncate">{item.nameSnapshot}</DrawerTitle>
          <DrawerDescription>
            {item.source === 'auto'
              ? 'Aggiunto dalla dispensa perché stava finendo.'
              : 'Reparto, unità e foto di questa voce.'}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          {imagesEnabled ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="bg-secondary text-muted-foreground relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                aria-label={item.imagePath ? 'Sostituisci la foto' : 'Aggiungi una foto'}
              >
                {item.imagePath ? (
                  <img src={apiUrl(item.imagePath)} alt="" className="size-full object-cover" />
                ) : (
                  <Camera className="size-6" />
                )}
                {uploading ? (
                  <span className="bg-background/70 absolute inset-0 flex items-center justify-center">
                    <Loader2 className="size-5 animate-spin" />
                  </span>
                ) : null}
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="text-muted-foreground text-xs">
                  Una foto serve alle voci che un nome non basta a riconoscere:
                  l’anticalcare giusto, la guarnizione della misura giusta.
                </p>
                {item.imagePath ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-fit rounded-full"
                    onClick={() => removeImage.mutate(item.id)}
                  >
                    <ImageOff /> Rimuovi foto
                  </Button>
                ) : null}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  void pickImage(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </div>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">Reparto</span>
            <Select
              value={item.category}
              onValueChange={(value) =>
                updateItem.mutate({ id: item.id, category: value as GroceryCategory })
              }
            >
              <SelectTrigger className="h-11 rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-md">
                {GROCERY_CATEGORY_ORDER.map((category) => (
                  <SelectItem key={category} value={category}>
                    {GROCERY_CATEGORY_LABELS[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">Unità</span>
            <Select
              value={item.unit}
              onValueChange={(value) =>
                updateItem.mutate({ id: item.id, unit: value as GroceryUnit })
              }
            >
              <SelectTrigger className="h-11 rounded-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-md">
                {GROCERY_UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit} hint={UNIT_HINTS[unit]}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <Button
            type="button"
            variant="destructive"
            className="rounded-full"
            onClick={() => onDelete(item)}
          >
            <Trash2 /> Elimina dalla lista
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
