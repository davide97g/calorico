import { useState } from 'react'
import {
  Check,
  Copy,
  Link2,
  LogOut,
  Pencil,
  Plus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { TopBar } from '@/components/layout/top-bar'
import { UserAvatar } from '@/components/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import {
  inviteUrl,
  useCreateFamily,
  useCreateInvite,
  useFamilies,
  useFamilyInvite,
  useLeaveFamily,
  useRenameFamily,
  useRevokeInvite,
  useSetActiveFamily,
} from '@/hooks/use-family'
import { dayOf, dayTimeLabel, longDayLabel } from '@/lib/date'
import type { Family } from '@/lib/types'

export default function FamilyPage() {
  const families = useFamilies()
  const createFamily = useCreateFamily()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const list = families.data?.families ?? []
  const activeFamilyId = families.data?.activeFamilyId ?? null

  const handleCreate = () => {
    const name = newName.trim()
    if (!name) return
    createFamily.mutate(name, {
      onSuccess: () => {
        setNewName('')
        setCreating(false)
        toast.success(`${name} creata. La tua lista è ora condivisa.`)
      },
      onError: () => toast.error('Creazione non riuscita'),
    })
  }

  return (
    <AppShell>
      <TopBar title="Famiglia" back />

      {families.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 rounded-lg" />
        </div>
      ) : list.length === 0 ? (
        <Panel className="flex flex-col items-center px-6 py-10 text-center">
          <span className="bg-primary/55 flex size-16 items-center justify-center rounded-lg">
            <Users className="text-primary-foreground size-7" />
          </span>
          <h2 className="mt-4 text-base font-bold">Nessuna famiglia</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Crea una famiglia per condividere lista della spesa e scansioni. Le
            calorie, il diario e il peso restano privati.
          </p>
        </Panel>
      ) : (
        list.map((family) => (
          <FamilyCard
            key={family.id}
            family={family}
            isActive={family.id === activeFamilyId}
            showActiveToggle={list.length > 1}
          />
        ))
      )}

      {creating ? (
        <Panel className="mt-3">
          <PanelHeader icon={<Plus />} title="Nuova famiglia" />
          <Input
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleCreate()
            }}
            placeholder="Casa Rossi"
            maxLength={60}
            className="mt-3 h-11 rounded-md"
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              className="rounded-full"
              onClick={() => {
                setCreating(false)
                setNewName('')
              }}
            >
              Annulla
            </Button>
            <Button
              className="rounded-full"
              onClick={handleCreate}
              disabled={createFamily.isPending || !newName.trim()}
            >
              Crea
            </Button>
          </div>
        </Panel>
      ) : (
        <Button
          variant="secondary"
          className="mt-3 w-full rounded-full"
          onClick={() => setCreating(true)}
        >
          <Plus />
          Crea una famiglia
        </Button>
      )}
    </AppShell>
  )
}

function FamilyCard({
  family,
  isActive,
  showActiveToggle,
}: {
  family: Family
  isActive: boolean
  showActiveToggle: boolean
}) {
  const invite = useFamilyInvite(family.id)
  const createInvite = useCreateInvite(family.id)
  const revokeInvite = useRevokeInvite(family.id)
  const renameFamily = useRenameFamily()
  const setActive = useSetActiveFamily()
  const leaveFamily = useLeaveFamily()

  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(family.name)
  const [copied, setCopied] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const current = invite.data?.invite ?? null

  const handleRename = () => {
    const next = name.trim()
    setRenaming(false)
    if (!next || next === family.name) {
      setName(family.name)
      return
    }
    renameFamily.mutate(
      { id: family.id, name: next },
      { onError: () => toast.error('Rinomina non riuscita') },
    )
  }

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(token))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copia non riuscita')
    }
  }

  return (
    <Panel className="mt-3">
      <div className="flex items-center justify-between gap-2">
        {renaming ? (
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={handleRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleRename()
              if (event.key === 'Escape') {
                setName(family.name)
                setRenaming(false)
              }
            }}
            maxLength={60}
            className="h-10 rounded-md"
          />
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="flex min-w-0 items-center gap-2 text-left"
          >
            <span className="truncate text-base font-bold">{family.name}</span>
            <Pencil className="text-muted-foreground size-3.5 shrink-0" />
          </button>
        )}

        {isActive && showActiveToggle ? (
          <Badge className="shrink-0">Attiva</Badge>
        ) : null}
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {family.members.map((member) => (
          <li key={member.id} className="flex items-center gap-2.5">
            <UserAvatar user={member} fallbackClassName="text-micro" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {member.name}
              </span>
              <span className="text-muted-foreground block text-micro">
                Dal {longDayLabel(dayOf(member.joinedAt))}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {showActiveToggle && isActive ? (
        <p className="text-muted-foreground mt-3 text-xs">
          Nuovi articoli e scansioni finiscono in questa lista. Le altre le vedi
          comunque tutte insieme.
        </p>
      ) : null}

      {showActiveToggle && !isActive ? (
        <Button
          variant="secondary"
          className="mt-3 w-full rounded-full"
          disabled={setActive.isPending}
          onClick={() =>
            setActive.mutate(family.id, {
              onSuccess: () =>
                toast.success(`Nuovi articoli e scansioni vanno in ${family.name}`),
              onError: () => toast.error('Cambio non riuscito'),
            })
          }
        >
          Rendi attiva
        </Button>
      ) : null}

      <div className="border-border mt-4 border-t pt-3">
        <PanelHeader icon={<Link2 />} title="Invito" />
        {current ? (
          <>
            <div className="bg-secondary mt-3 flex items-center gap-2 rounded-md p-2 pl-3">
              <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                {inviteUrl(current.token)}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                onClick={() => void copyLink(current.token)}
                aria-label="Copia link di invito"
              >
                {copied ? <Check className="text-primary-strong" /> : <Copy />}
              </Button>
            </div>
            <p className="text-muted-foreground mt-2 text-micro">
              Valido fino al {dayTimeLabel(current.expiresAt)}. Chiunque abbia il
              link può unirsi.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                className="rounded-full"
                disabled={revokeInvite.isPending}
                onClick={() =>
                  revokeInvite.mutate(current.id, {
                    onSuccess: () => toast.success('Link disattivato'),
                    onError: () => toast.error('Operazione non riuscita'),
                  })
                }
              >
                Disattiva
              </Button>
              <Button
                variant="secondary"
                className="rounded-full"
                disabled={createInvite.isPending}
                onClick={() => createInvite.mutate()}
              >
                Nuovo link
              </Button>
            </div>
          </>
        ) : (
          <Button
            className="mt-3 w-full rounded-full"
            disabled={createInvite.isPending || invite.isLoading}
            onClick={() =>
              createInvite.mutate(undefined, {
                onError: () => toast.error('Creazione link non riuscita'),
              })
            }
          >
            <Link2 />
            Genera link di invito
          </Button>
        )}
      </div>

      <Button
        variant="ghost"
        className="text-destructive hover:text-destructive mt-2 w-full rounded-full"
        onClick={() => setConfirmLeave(true)}
      >
        <LogOut />
        Esci dalla famiglia
      </Button>

      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent className="max-w-sm rounded-lg" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Uscire da “{family.name}”?</DialogTitle>
            <DialogDescription>
              {family.members.length > 1
                ? 'La lista condivisa resta agli altri membri e tu non la vedrai più.'
                : 'Sei l’ultimo membro: la lista torna privata e la famiglia viene eliminata.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 sm:grid-cols-2">
            <DialogClose asChild>
              <Button variant="secondary" className="rounded-full">
                Annulla
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              className="rounded-full"
              disabled={leaveFamily.isPending}
              onClick={() => {
                setConfirmLeave(false)
                leaveFamily.mutate(family.id, {
                  onSuccess: () => toast.success(`Sei uscito da ${family.name}`),
                  onError: () => toast.error('Uscita non riuscita'),
                })
              }}
            >
              Esci
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}
