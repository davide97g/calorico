import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarPlus, ScanBarcode, Search } from 'lucide-react'
import { ScanSheet } from '@/components/food/scan-sheet'
import { WhenSheet } from '@/components/food/when-picker'
import { labelForDay } from '@/lib/date'
import { currentMeal } from '@/lib/format'

/**
 * Adding a food the app has not seen this user eat before: by name or by
 * barcode. Repeating a known food is the strip above this card, and the meal
 * photo — a restaurant plate, once in a while — lives on the search screen.
 */
export function AddFoodAction({ day }: { day: string }) {
  const navigate = useNavigate()
  const [scanning, setScanning] = useState(false)
  const [planning, setPlanning] = useState(false)

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

      <ScanSheet
        open={scanning}
        onOpenChange={setScanning}
        day={day}
        meal={currentMeal()}
      />
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
