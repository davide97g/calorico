import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarPlus, Camera, ScanBarcode, Search } from 'lucide-react'
import { ScanSheet } from '@/components/food/scan-sheet'
import { PhotoMealSheet } from '@/components/food/photo-meal-sheet'
import { WhenSheet } from '@/components/food/when-picker'
import { useVisionStatus } from '@/hooks/use-diary'
import { labelForDay } from '@/lib/date'
import { currentMeal } from '@/lib/format'

/** Primary dashboard action: choose a food by name, barcode or photo before
 * selecting its portion. Keeping the paths together makes "add food" a clear
 * job. */
export function AddFoodAction({ day }: { day: string }) {
  const navigate = useNavigate()
  const [scanning, setScanning] = useState(false)
  const [photographing, setPhotographing] = useState(false)
  const [planning, setPlanning] = useState(false)
  // No provider configured on the server means no dead-end button.
  const photoEnabled = useVisionStatus().data?.enabled ?? false

  return (
    <section className="bg-card shadow-soft rounded-[28px] p-3">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">Aggiungi alimento</h2>
          <p className="text-muted-foreground mt-0.5 truncate text-[11px] font-medium">
            {labelForDay(day)} · scegli come iniziare
          </p>
        </div>
        {/* The planning door. Everything below assumes "now"; this is where the
            user says otherwise before picking a food. */}
        <button
          type="button"
          onClick={() => setPlanning(true)}
          className="bg-accent text-accent-foreground flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold transition-transform active:scale-[0.97]"
        >
          <CalendarPlus className="size-4" strokeWidth={2.4} />
          Pianifica per dopo
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link
          to={`/add?day=${day}&meal=${currentMeal()}`}
          className="bg-primary text-primary-foreground flex min-h-14 items-center justify-center gap-2 rounded-[20px] px-3 text-sm font-bold transition-transform active:scale-[0.98]"
        >
          <Search className="size-4.5" strokeWidth={2.5} />
          Cerca alimento
        </Link>
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="bg-secondary text-foreground flex min-h-14 items-center justify-center gap-2 rounded-[20px] px-3 text-sm font-bold transition-transform active:scale-[0.98]"
        >
          <ScanBarcode
            className="text-primary-strong size-5"
            strokeWidth={2.4}
          />
          Scansiona
        </button>
      </div>

      {photoEnabled && (
        <button
          type="button"
          onClick={() => setPhotographing(true)}
          className="bg-secondary text-foreground mt-2 flex min-h-14 w-full items-center justify-center gap-2 rounded-[20px] px-3 text-sm font-bold transition-transform active:scale-[0.98]"
        >
          <Camera className="text-primary-strong size-5" strokeWidth={2.4} />
          Fotografa il pasto
        </button>
      )}

      <ScanSheet
        open={scanning}
        onOpenChange={setScanning}
        day={day}
        meal={currentMeal()}
      />
      {photoEnabled && (
        <PhotoMealSheet
          open={photographing}
          onOpenChange={setPhotographing}
          day={day}
          meal={currentMeal()}
        />
      )}
      <WhenSheet
        open={planning}
        onOpenChange={setPlanning}
        value={{ day, meal: currentMeal() }}
        confirmLabel="Scegli l'alimento"
        onConfirm={(when) => navigate(`/add?day=${when.day}&meal=${when.meal}`)}
      />
    </section>
  )
}
