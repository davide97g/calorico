import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BellRing,
  Check,
  Clock,
  Globe2,
  Plus,
  Send,
  Smartphone,
  Stethoscope,
  TriangleAlert,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { ReminderRow } from '@/components/notifications/reminder-row'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  browserTimezone,
  pushErrorMessage,
  useApplyDefaultReminders,
  useCreateReminder,
  useDeleteReminder,
  useDisableNotifications,
  useEnableNotifications,
  useNotificationSettings,
  useRepairSubscription,
  useTestNotification,
  useUpdateNotificationSettings,
  useUpdateReminder,
} from '@/hooks/use-notifications'
import { ApiError } from '@/lib/api'
import {
  needsInstallFirst,
  pushDiagnostics,
  pushPermission,
  pushSupported,
  showLocalNotification,
  subscribeToPush,
  type PushDiagnostics,
} from '@/lib/push'
import { clockTime, parseClockTime, weekdaysLabel } from '@/lib/format'
import type { ReminderPreset } from '@/lib/types'

/**
 * Reminder settings.
 *
 * The screen has to be honest about a stack of things that can silently stop a
 * notification from ever arriving — no VAPID keys on the server, a browser that
 * has no push at all, an iPhone that never installed the app, a permission the
 * user denied months ago, an account whose only device unsubscribed itself. Each
 * one gets said out loud, because the alternative is a switch that looks on and
 * a phone that stays quiet.
 */
export default function NotificationsPage() {
  const navigate = useNavigate()
  const settings = useNotificationSettings()
  const enable = useEnableNotifications()
  const disable = useDisableNotifications()
  const repair = useRepairSubscription()
  const updateSettings = useUpdateNotificationSettings()
  const createReminder = useCreateReminder()
  const updateReminder = useUpdateReminder()
  const deleteReminder = useDeleteReminder()
  const applyDefaults = useApplyDefaultReminders()
  const test = useTestNotification()

  const data = settings.data
  const publicKey = data?.push.publicKey ?? null
  const repaired = useRef(false)
  /** True while the browser is being asked for permission and a subscription. */
  const [arming, setArming] = useState(false)
  const [diagnostics, setDiagnostics] = useState<PushDiagnostics | null>(null)

  /** Re-read the browser's side of things; cheap, and never throws. */
  const refreshDiagnostics = useCallback(async () => {
    try {
      setDiagnostics(await pushDiagnostics())
    } catch {
      setDiagnostics(null)
    }
  }, [])

  // Read once on open, and again whenever the device count moves: those are the
  // two moments the answer can have changed under us.
  useEffect(() => {
    void refreshDiagnostics()
  }, [refreshDiagnostics, data?.devices])

  /**
   * A browser can drop its push subscription on its own, and the account keeps
   * looking armed. Opening this screen is the natural moment to notice and fix
   * it, once per visit.
   */
  useEffect(() => {
    if (repaired.current) return
    if (!data?.enabled || !publicKey || data.devices > 0) return
    repaired.current = true
    repair.mutate(publicKey)
  }, [data?.enabled, data?.devices, publicKey, repair])

  /**
   * Arms this browser: permission, subscription, then the server.
   *
   * The first two steps run here rather than inside the mutation because they
   * must start inside the tap — Safari draws the permission prompt only while
   * the gesture is live, and react-query awaits before it calls a `mutationFn`.
   * Nothing may be awaited before `subscribeToPush`.
   */
  const arm = (key: string, done: () => void) => {
    setArming(true)
    subscribeToPush(key)
      .then((subscription) => {
        enable.mutate(subscription, {
          onSuccess: done,
          onError: (error) =>
            toast.error(
              error instanceof ApiError && error.code === 'push_disabled'
                ? 'Il server non ha le chiavi push configurate.'
                : 'Registrazione non riuscita. Riprova.',
            ),
        })
      })
      .catch((error) => toast.error(pushErrorMessage(error)))
      .finally(() => {
        setArming(false)
        void refreshDiagnostics()
      })
  }

  const handleToggle = (next: boolean) => {
    if (!next) {
      disable.mutate(undefined, {
        onSuccess: () => {
          toast.success('Promemoria disattivati')
          void refreshDiagnostics()
        },
        onError: () => toast.error('Operazione non riuscita'),
      })
      return
    }
    if (!publicKey) {
      toast.error('Le notifiche non sono configurate su questo server.')
      return
    }
    arm(publicKey, () => {
      toast.success('Notifiche attive su questo dispositivo')
      // A first-time user with no reminders would arm notifications and get
      // nothing, so the suggested set is offered right here.
      if ((data?.reminders.length ?? 0) === 0) {
        applyDefaults.mutate(undefined, {
          onSuccess: ({ created }) => {
            if (created > 0) toast.success('Aggiunti i promemoria consigliati')
          },
        })
      }
    })
  }

  const handleAddPreset = (preset: ReminderPreset) => {
    createReminder.mutate(
      {
        kind: preset.kind,
        meal: preset.meal,
        label: preset.label,
        atMinutes: preset.atMinutes,
        weekdays: preset.weekdays,
        skipIfLogged: preset.skipIfLogged,
      },
      {
        onSuccess: () => toast.success(`${preset.label} aggiunto`),
        onError: (error) =>
          toast.error(
            error instanceof ApiError && error.code === 'too_many_reminders'
              ? 'Hai raggiunto il numero massimo di promemoria.'
              : 'Aggiunta non riuscita',
          ),
      },
    )
  }

  if (settings.isLoading || !data) {
    return (
      <AppShell>
        <header className="mb-3 flex items-center gap-2">
          <BackButton onClick={() => navigate(-1)} />
          <h1 className="text-[17px] font-bold">Promemoria</h1>
        </header>
        <Skeleton className="h-28 rounded-[28px]" />
        <Skeleton className="mt-3 h-40 rounded-[28px]" />
      </AppShell>
    )
  }

  const serverReady = data.push.supported
  // An iPhone in a Safari tab has no Notification API at all, so "install
  // first" has to be decided before, and independently of, browser support:
  // otherwise the screen blames the browser for something an install fixes.
  const installFirst = needsInstallFirst()
  const browserReady = pushSupported()
  const permission = browserReady ? pushPermission() : 'default'
  const canArm = serverReady && !installFirst && browserReady
  const busy = arming || enable.isPending || disable.isPending
  const savedTimezone = data.timezone
  const localTimezone = browserTimezone()
  const usedPresetKeys = new Set(
    data.reminders.map((r) => `${r.kind}:${r.meal ?? ''}`),
  )
  const suggestions = data.presets.filter(
    (preset) => !usedPresetKeys.has(`${preset.kind}:${preset.meal ?? ''}`),
  )
  const full = data.reminders.length >= data.maxReminders

  return (
    <AppShell>
      <header className="mb-3 flex items-center gap-2">
        <BackButton onClick={() => navigate(-1)} />
        <h1 className="text-[17px] font-bold">Promemoria</h1>
      </header>

      <Panel>
        <PanelHeader
          icon={<BellRing />}
          title="Notifiche"
          action={
            <Switch
              checked={data.enabled}
              disabled={(!canArm && !data.enabled) || busy}
              onCheckedChange={handleToggle}
              aria-label="Attiva le notifiche"
            />
          }
        />
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          Promemoria a orari fissi, inviati anche ad app chiusa. Niente cibo né
          numeri nel testo: solo il nome del promemoria.
        </p>

        {!serverReady ? (
          <Notice>
            Questo server non ha le chiavi push configurate (VAPID), quindi le
            notifiche non possono essere inviate.
          </Notice>
        ) : installFirst ? (
          <Notice>
            Su iPhone e iPad aggiungi Calorico alla schermata Home (Condividi →
            Aggiungi a Home) e riapri l’app da lì: Safari chiede il permesso, e
            consegna le notifiche, solo all’app installata.
          </Notice>
        ) : !browserReady ? (
          <Notice>Questo browser non supporta le notifiche push.</Notice>
        ) : permission === 'denied' ? (
          <Notice>
            Le notifiche sono bloccate per questo sito. Riattivale dalle
            impostazioni del browser, poi torna qui.
          </Notice>
        ) : null}

        {data.enabled ? (
          <>
            <div className="bg-muted mt-3 flex items-center gap-2.5 rounded-2xl p-3">
              <Smartphone className="text-muted-foreground size-4 shrink-0" />
              <p className="min-w-0 flex-1 text-[11px] leading-relaxed">
                {data.devices === 0
                  ? 'Nessun dispositivo registrato: i promemoria non possono arrivare.'
                  : `${data.devices} ${data.devices === 1 ? 'dispositivo registrato' : 'dispositivi registrati'}.`}
              </p>
              {data.devices === 0 && publicKey && canArm ? (
                <Button
                  variant="secondary"
                  className="bg-card h-9 shrink-0 rounded-full px-3 text-xs"
                  onClick={() =>
                    arm(publicKey, () => toast.success('Dispositivo registrato'))
                  }
                  disabled={busy}
                >
                  Registra
                </Button>
              ) : null}
            </div>

            {savedTimezone !== localTimezone ? (
              <div className="bg-muted mt-2 flex items-center gap-2.5 rounded-2xl p-3">
                <Globe2 className="text-muted-foreground size-4 shrink-0" />
                <p className="min-w-0 flex-1 text-[11px] leading-relaxed">
                  Gli orari sono letti su <strong>{savedTimezone}</strong>, ma
                  questo dispositivo è su <strong>{localTimezone}</strong>.
                </p>
                <Button
                  variant="secondary"
                  className="bg-card h-9 shrink-0 rounded-full px-3 text-xs"
                  onClick={() =>
                    updateSettings.mutate(
                      { timezone: localTimezone },
                      {
                        onSuccess: () => toast.success('Fuso orario aggiornato'),
                        onError: () => toast.error('Aggiornamento non riuscito'),
                      },
                    )
                  }
                  disabled={updateSettings.isPending}
                >
                  Usa questo
                </Button>
              </div>
            ) : null}

            <Button
              variant="secondary"
              className="mt-3 w-full rounded-full"
              onClick={() =>
                test.mutate(undefined, {
                  onSuccess: () => toast.success('Notifica di prova inviata'),
                  onError: (error) => toast.error(testErrorMessage(error)),
                })
              }
              disabled={test.isPending}
            >
              <Send className="size-4" />
              Invia una notifica di prova
            </Button>
          </>
        ) : null}
      </Panel>

      {suggestions.length > 0 && !full ? (
        <Panel className="mt-3">
          <PanelHeader
            title="Consigliati"
            action={
              data.reminders.length === 0 ? (
                <Button
                  variant="secondary"
                  className="bg-muted h-9 rounded-full px-3 text-xs"
                  onClick={() =>
                    applyDefaults.mutate(undefined, {
                      onSuccess: ({ created }) =>
                        toast.success(
                          created > 0
                            ? `${created} promemoria aggiunti`
                            : 'Li hai già tutti',
                        ),
                      onError: () => toast.error('Aggiunta non riuscita'),
                    })
                  }
                  disabled={applyDefaults.isPending}
                >
                  Aggiungi tutti
                </Button>
              ) : undefined
            }
          />
          <ul className="mt-3 flex flex-col gap-2">
            {suggestions.map((preset) => (
              <li
                key={preset.key}
                className="bg-muted flex items-center gap-3 rounded-2xl p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">
                    {preset.label} · {clockTime(preset.atMinutes)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
                    {weekdaysLabel(preset.weekdays)}. {preset.description}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="icon"
                  className="bg-card size-9 shrink-0 rounded-full"
                  onClick={() => handleAddPreset(preset)}
                  disabled={createReminder.isPending}
                  aria-label={`Aggiungi ${preset.label}`}
                >
                  <Plus className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel className="mt-3">
        <PanelHeader
          icon={<Clock />}
          title="I tuoi promemoria"
          action={
            <span className="text-muted-foreground text-[11px]">
              {data.reminders.length}/{data.maxReminders}
            </span>
          }
        />
        {data.reminders.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Nessun promemoria. Parti dai consigliati qui sopra, oppure creane uno
            tuo.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col">
            {data.reminders.map((reminder) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                onChange={(patch) =>
                  updateReminder.mutate(
                    { id: reminder.id, ...patch },
                    { onError: () => toast.error('Modifica non riuscita') },
                  )
                }
                onDelete={() =>
                  deleteReminder.mutate(reminder.id, {
                    onSuccess: () => toast.success('Promemoria eliminato'),
                    onError: () => toast.error('Eliminazione non riuscita'),
                  })
                }
              />
            ))}
          </ul>
        )}
        {!data.enabled && data.reminders.length > 0 ? (
          <p className="text-muted-foreground mt-3 text-[11px] leading-relaxed">
            Le notifiche sono spente: questi promemoria restano salvati ma non
            vengono inviati.
          </p>
        ) : null}
      </Panel>

      <CustomReminderForm
        disabled={full || createReminder.isPending}
        full={full}
        onCreate={(label, atMinutes) =>
          createReminder.mutate(
            { kind: 'custom', label, atMinutes },
            {
              onSuccess: () => toast.success('Promemoria creato'),
              onError: () => toast.error('Creazione non riuscita'),
            },
          )
        }
      />

      <DiagnosticsPanel
        diagnostics={diagnostics}
        serverReady={serverReady}
        devices={data.devices}
        onRefresh={() => void refreshDiagnostics()}
      />
    </AppShell>
  )
}

/** Why a push failed, in the words of the thing that failed. */
function testErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return 'Invio non riuscito'
  switch (error.code) {
    case 'no_devices':
      return 'Nessun dispositivo registrato per questo account.'
    case 'push_disabled':
      return 'Il server non ha le chiavi push configurate.'
    case 'push_failed':
      return 'Il servizio push ha rifiutato la notifica: controlla le chiavi VAPID del server.'
    default:
      return 'Invio non riuscito'
  }
}

/**
 * Every condition a notification depends on, listed with its answer.
 *
 * "Notifications are on and nothing arrives" has half a dozen causes that look
 * identical from the outside, and a phone has no console to check them in. So
 * they are all on screen: the first ✗ is the reason.
 */
function DiagnosticsPanel({
  diagnostics,
  serverReady,
  devices,
  onRefresh,
}: {
  diagnostics: PushDiagnostics | null
  serverReady: boolean
  devices: number
  onRefresh: () => void
}) {
  const permissionLabel = {
    granted: 'concesso',
    denied: 'negato',
    default: 'non ancora chiesto',
  }

  return (
    <Panel className="mt-3">
      <PanelHeader
        icon={<Stethoscope />}
        title="Diagnostica"
        action={
          <Button
            variant="secondary"
            className="bg-muted h-9 rounded-full px-3 text-xs"
            onClick={onRefresh}
          >
            Aggiorna
          </Button>
        }
      />
      <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
        Serve tutto quanto segue perché una notifica arrivi. La prima riga con ✗
        è il motivo del silenzio.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        <DiagnosticRow
          label="Chiavi push sul server (VAPID)"
          ok={serverReady}
          detail={
            serverReady
              ? undefined
              : 'Imposta VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT sul server, poi riavvialo.'
          }
        />
        {diagnostics ? (
          <>
            <DiagnosticRow
              label="Notifiche supportate dal browser"
              ok={diagnostics.notificationApi && diagnostics.pushApi}
              detail={
                diagnostics.notificationApi && diagnostics.pushApi
                  ? undefined
                  : diagnostics.ios && !diagnostics.standalone
                    ? 'Su iPhone le API esistono solo nell’app installata.'
                    : 'Questo browser non espone Notification o PushManager.'
              }
            />
            {diagnostics.ios ? (
              <DiagnosticRow
                label="App aggiunta alla schermata Home"
                ok={diagnostics.standalone}
                detail={
                  diagnostics.standalone
                    ? undefined
                    : 'Condividi → Aggiungi a Home, poi apri Calorico da lì.'
                }
              />
            ) : null}
            <DiagnosticRow
              label={`Permesso: ${permissionLabel[diagnostics.permission]}`}
              ok={diagnostics.permission === 'granted'}
              detail={
                diagnostics.permission === 'denied'
                  ? 'Solo le impostazioni del browser possono riattivarlo.'
                  : undefined
              }
            />
            <DiagnosticRow
              label="Service worker registrato"
              ok={diagnostics.serviceWorker}
              detail={
                diagnostics.serviceWorker
                  ? undefined
                  : 'Ricarica l’app: il worker si registra all’avvio.'
              }
            />
            <DiagnosticRow
              label="Iscrizione push su questo dispositivo"
              ok={diagnostics.subscribed}
            />
          </>
        ) : null}
        <DiagnosticRow
          label={`Dispositivi registrati sul server: ${devices}`}
          ok={devices > 0}
        />
      </ul>

      {diagnostics?.permission === 'granted' && diagnostics.serviceWorker ? (
        <>
          <Button
            variant="secondary"
            className="mt-3 w-full rounded-full"
            onClick={() => {
              showLocalNotification().catch((error) =>
                toast.error(pushErrorMessage(error)),
              )
            }}
          >
            <BellRing className="size-4" />
            Prova senza il server
          </Button>
          <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
            Mostra una notifica dal dispositivo stesso. Se questa arriva e quella
            di prova no, il problema è nella consegna: chiavi, iscrizione o
            server.
          </p>
        </>
      ) : null}
    </Panel>
  )
}

function DiagnosticRow({
  label,
  ok,
  detail,
}: {
  label: string
  ok: boolean
  detail?: string
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={`mt-px flex size-4 shrink-0 items-center justify-center rounded-full ${
          ok ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20'
        }`}
      >
        {ok ? <Check className="size-3" /> : <X className="size-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-relaxed font-medium">{label}</p>
        {detail ? (
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            {detail}
          </p>
        ) : null}
      </div>
    </li>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="secondary"
      size="icon"
      className="bg-card shadow-soft size-10 shrink-0 rounded-full"
      onClick={onClick}
      aria-label="Torna indietro"
    >
      <ArrowLeft className="size-4" />
    </Button>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted mt-3 flex items-start gap-2.5 rounded-2xl p-3">
      <TriangleAlert className="text-muted-foreground mt-px size-4 shrink-0" />
      <p className="text-[11px] leading-relaxed">{children}</p>
    </div>
  )
}

/**
 * A reminder in the user's own words. Always fires: unlike a meal or a weigh-in,
 * nothing in the database can tell us the thing was done.
 */
function CustomReminderForm({
  onCreate,
  disabled,
  full,
}: {
  onCreate: (label: string, atMinutes: number) => void
  disabled: boolean
  full: boolean
}) {
  const [label, setLabel] = useState('')
  const [time, setTime] = useState('12:00')

  const minutes = parseClockTime(time)
  const canSubmit = label.trim().length > 0 && minutes !== null && !disabled

  return (
    <Panel className="mt-3">
      <PanelHeader title="Promemoria personale" />
      {full ? (
        <p className="text-muted-foreground mt-2 text-sm">
          Hai raggiunto il numero massimo di promemoria. Eliminane uno per
          aggiungerne un altro.
        </p>
      ) : (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!canSubmit || minutes === null) return
            onCreate(label.trim(), minutes)
            setLabel('')
          }}
        >
          <div className="flex gap-2">
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="Ora"
              className="tabular h-11 w-[108px] shrink-0 rounded-2xl font-semibold"
            />
            <Input
              value={label}
              maxLength={60}
              placeholder="Bevi un bicchiere d'acqua"
              onChange={(e) => setLabel(e.target.value)}
              aria-label="Testo del promemoria"
              className="h-11 min-w-0 flex-1 rounded-2xl"
            />
          </div>
          <Button type="submit" className="w-full rounded-full" disabled={!canSubmit}>
            <Plus className="size-4" />
            Aggiungi promemoria
          </Button>
        </form>
      )}
    </Panel>
  )
}
