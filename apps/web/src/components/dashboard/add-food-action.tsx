import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ScanBarcode, Search } from 'lucide-react'
import { ScanSheet } from '@/components/food/scan-sheet'
import { labelForDay } from '@/lib/date'
import { currentMeal } from '@/lib/format'

/**
 * Adding a food the app has not seen this user eat before: by name or by
 * barcode. Repeating a known food is the strip above this card, and the meal
 * photo — a restaurant plate, once in a while — lives on the search screen.
 *
 * Planning for another day used to have a chip up here. It is a rare job, and
 * both screens this card leads to already carry the day-and-meal picker.
 */
export function AddFoodAction({ day }: { day: string }) {
  const [scanning, setScanning] = useState(false)

  return (
    <section className="bg-card shadow-soft rounded-lg p-3">
      <div className="mb-2 px-1">
        <h2 className="text-base font-bold">Aggiungi alimento</h2>
        <p className="text-muted-foreground mt-0.5 truncate text-micro font-medium">
          {labelForDay(day)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link
          to={`/add?day=${day}&meal=${currentMeal()}&focus=1`}
          className="bg-primary text-primary-foreground flex min-h-14 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition-transform active:scale-[0.98]"
        >
          <Search className="size-4.5" strokeWidth={2.5} />
          Cerca alimento
        </Link>
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="bg-secondary text-foreground flex min-h-14 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition-transform active:scale-[0.98]"
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
    </section>
  )
}
