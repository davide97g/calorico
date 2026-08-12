import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
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
import { api, ApiError } from '@/lib/api'

/**
 * Deletes the account for good. Two brakes, both deliberate: the password has to
 * be typed again (a stolen token must not be able to do this) and so does the
 * word ELIMINA, because everything goes — diary, weights, custom foods.
 */
export function DeleteAccountDialog({
  onDeleted,
}: {
  /** Called after the server confirms; the caller signs out and redirects. */
  onDeleted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const armed = password.length > 0 && confirm.trim().toUpperCase() === 'ELIMINA'

  const close = (next: boolean) => {
    if (pending) return
    setOpen(next)
    if (!next) {
      setPassword('')
      setConfirm('')
      setError(null)
    }
  }

  const submit = async () => {
    setPending(true)
    setError(null)
    try {
      await api('/profile', { method: 'DELETE', body: { password } })
      onDeleted()
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'invalid_credentials'
          ? 'Password non corretta.'
          : 'Eliminazione non riuscita. Riprova.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <Button
        variant="ghost"
        className="text-destructive w-full rounded-full"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
        Elimina account
      </Button>

      <DialogContent className="rounded-lg">
        <DialogHeader>
          <DialogTitle>Eliminare l&apos;account?</DialogTitle>
          <DialogDescription>
            Spariscono diario, pesi, preferiti, lista della spesa e alimenti
            creati da te. L&apos;operazione non si può annullare.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              La tua password
            </span>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-md"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Scrivi ELIMINA per confermare
            </span>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoCapitalize="characters"
              className="h-11 rounded-md"
            />
          </label>

          {error ? (
            <p className="text-destructive text-xs font-semibold">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            className="rounded-full"
            onClick={() => close(false)}
            disabled={pending}
          >
            Annulla
          </Button>
          <Button
            variant="destructive"
            className="rounded-full"
            onClick={() => void submit()}
            disabled={!armed || pending}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Elimina per sempre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
