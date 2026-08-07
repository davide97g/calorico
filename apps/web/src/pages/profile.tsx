import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from 'next-themes'
import {
  ArrowLeft,
  BellRing,
  CreditCard,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  ShieldOff,
  Sparkles,
  Sun,
  Target,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar'
import { UserAvatar } from '@/components/user-avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DeleteAccountDialog } from '@/components/profile/delete-account-dialog'
import { PremiumSheet } from '@/components/premium/premium-sheet'
import { useAuth } from '@/hooks/use-auth'
import { useFamilies } from '@/hooks/use-family'
import { useSuggestedTargets, useUpdateProfile } from '@/hooks/use-diary'
import {
  useBillingPortal,
  useCancelPremium,
  usePremium,
} from '@/hooks/use-premium'
import { useNotificationSettings } from '@/hooks/use-notifications'
import { api } from '@/lib/api'
import {
  ACTIVITY_HINTS,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  SEX_LABELS,
  grams,
  kcal,
} from '@/lib/format'
import type { ActivityLevel, Goal, Sex } from '@/lib/types'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, profile, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const updateProfile = useUpdateProfile()
  const suggested = useSuggestedTargets()
  const families = useFamilies()
  const premium = usePremium()
  const cancelPremium = useCancelPremium()
  const billingPortal = useBillingPortal()
  const notifications = useNotificationSettings()
  const [saving, setSaving] = useState(false)
  const [paywall, setPaywall] = useState(false)
  const [signingOutAll, setSigningOutAll] = useState(false)

  const [targets, setTargets] = useState({
    kcal: '',
    protein: '',
    carbs: '',
    fat: '',
  })

  if (!profile || !user) return null

  const familyList = families.data?.families ?? []

  const num = (v: string, fallback: number) => {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback
  }

  const handleSaveTargets = () => {
    const kcalValue = num(targets.kcal, profile.targetKcal)
    updateProfile.mutate(
      {
        targetKcal: kcalValue,
        targetProteinG: num(targets.protein, profile.targetProteinG),
        targetCarbsG: num(targets.carbs, profile.targetCarbsG),
        targetFatG: num(targets.fat, profile.targetFatG),
        targetKcalMin: kcalValue - 150,
        targetKcalMax: kcalValue + 150,
      },
      {
        onSuccess: () => {
          toast.success('Obiettivi aggiornati')
          setTargets({ kcal: '', protein: '', carbs: '', fat: '' })
        },
        onError: () => toast.error('Aggiornamento non riuscito'),
      },
    )
  }

  /**
   * Takes only the protein figure from the suggestion: calories and the other
   * macros may well be hand-tuned, and overwriting them is a bigger decision
   * than "give me the standard protein amount" (that is Ricalcola's job).
   */
  const handleUseSuggestedProtein = (proteinG: number) => {
    updateProfile.mutate(
      { targetProteinG: proteinG },
      {
        onSuccess: () => {
          toast.success(`Proteine impostate a ${proteinG} g`)
          setTargets((t) => ({ ...t, protein: '' }))
        },
        onError: () => toast.error('Aggiornamento non riuscito'),
      },
    )
  }

  const handleRecalculate = async () => {
    setSaving(true)
    try {
      await api('/profile/recalculate', { method: 'POST' })
      toast.success('Obiettivi ricalcolati dal peso più recente')
      window.location.reload()
    } catch {
      toast.error('Ricalcolo non riuscito. Completa peso e altezza.')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Every token issued to this account stops working, this one included — the
   * point of the button. So the local session goes too.
   */
  const handleSignOutEverywhere = async () => {
    setSigningOutAll(true)
    try {
      await api('/auth/logout-all', { method: 'POST' })
      logout()
      navigate('/login', { replace: true })
    } catch {
      toast.error('Operazione non riuscita. Riprova.')
    } finally {
      setSigningOutAll(false)
    }
  }

  const quota = premium.data?.photoQuota
  /** The day the subscription next renews, or the day it lapses if disdetto. */
  const renewal = premium.data?.until
    ? new Date(premium.data.until).toLocaleDateString('it-IT', {
        day: 'numeric',
        month: 'long',
      })
    : 'fine periodo'
  const activeReminders =
    notifications.data?.reminders.filter((r) => r.enabled).length ?? 0

  return (
    <AppShell>
      <header className="mb-3 flex items-center gap-2">
        <Button
          variant="secondary"
          size="icon"
          className="bg-card shadow-soft size-10 shrink-0 rounded-full"
          onClick={() => navigate(-1)}
          aria-label="Torna indietro"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-[17px] font-bold">Profilo</h1>
      </header>

      <Panel className="flex items-center gap-3">
        <UserAvatar
          user={user}
          className="size-14"
          fallbackClassName="bg-primary text-primary-foreground text-lg"
        />
        <div className="min-w-0">
          <p className="truncate text-base font-bold">{user.name}</p>
          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
        </div>
      </Panel>

      <Panel className="mt-3">
        <PanelHeader icon={<Users />} title="Famiglia" to="/family" />
        {familyList.length ? (
          <ul className="mt-3 flex flex-col gap-3">
            {familyList.map((family) => (
              <li key={family.id} className="flex items-center gap-3">
                <AvatarGroup>
                  {family.members.slice(0, 4).map((member) => (
                    <UserAvatar
                      key={member.id}
                      user={member}
                      size="sm"
                      fallbackClassName="text-[9px]"
                    />
                  ))}
                  {family.members.length > 4 ? (
                    <AvatarGroupCount className="size-6 text-[10px]">
                      +{family.members.length - 4}
                    </AvatarGroupCount>
                  ) : null}
                </AvatarGroup>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {family.name}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {family.members.length}{' '}
                    {family.members.length === 1 ? 'membro' : 'membri'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">
            Condividi lista della spesa e scansioni con chi vive con te. Il
            diario e il peso restano solo tuoi.
          </p>
        )}
      </Panel>

      <Panel className="mt-3">
        <PanelHeader icon={<BellRing />} title="Promemoria" to="/notifications" />
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          {notifications.data?.enabled
            ? `${activeReminders} ${activeReminders === 1 ? 'promemoria attivo' : 'promemoria attivi'}: pasti, controllo serale, pesata.`
            : 'Avvisi a orari fissi per registrare i pasti, controllare la giornata e pesarti.'}
        </p>
      </Panel>

      <Panel className="mt-3">
        <PanelHeader icon={<Sparkles />} title="Premium" />
        {premium.data?.isPremium ? (
          <>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              {premium.data.cancelAtPeriodEnd
                ? `Disdetto: resta attivo fino al ${renewal}, poi torni al piano gratuito.`
                : `Attivo: foto dei pasti senza limiti. Rinnovo il ${renewal}.`}
            </p>
            <Button
              variant="secondary"
              className="mt-3 w-full rounded-full"
              onClick={() =>
                billingPortal.mutate(undefined, {
                  onError: () => toast.error('Non riesco ad aprire Stripe'),
                })
              }
              disabled={billingPortal.isPending}
            >
              <CreditCard className="size-4" />
              Gestisci l&apos;abbonamento
            </Button>
            {!premium.data.cancelAtPeriodEnd && (
              <Button
                variant="ghost"
                className="mt-1 w-full rounded-full"
                onClick={() =>
                  cancelPremium.mutate(undefined, {
                    onSuccess: () =>
                      toast.success('Disdetto. Resta attivo fino a fine periodo.'),
                    onError: () => toast.error('Operazione non riuscita'),
                  })
                }
                disabled={cancelPremium.isPending}
              >
                Disdici il rinnovo
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              {quota && quota.limit !== null
                ? `Hai usato ${quota.used} foto gratuite su ${quota.limit}.`
                : 'Le foto dei pasti gratuite sono limitate.'}{' '}
              Con Premium l&apos;analisi delle foto non ha limiti.
            </p>
            <Button
              className="mt-3 w-full rounded-full"
              onClick={() => setPaywall(true)}
              disabled={premium.data?.paymentsEnabled === false}
            >
              <Sparkles className="size-4" />
              {premium.data
                ? `Passa a Premium — ${premium.data.priceEur},00 €/mese`
                : 'Passa a Premium'}
            </Button>
          </>
        )}
      </Panel>

      <Panel className="mt-3">
        <PanelHeader icon={<Target />} title="Obiettivi giornalieri" />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <TargetField
            label="Calorie"
            unit="kcal"
            current={profile.targetKcal}
            value={targets.kcal}
            onChange={(v) => setTargets((t) => ({ ...t, kcal: v }))}
          />
          <TargetField
            label="Proteine"
            unit="g"
            current={profile.targetProteinG}
            value={targets.protein}
            onChange={(v) => setTargets((t) => ({ ...t, protein: v }))}
          />
          <TargetField
            label="Carboidrati"
            unit="g"
            current={profile.targetCarbsG}
            value={targets.carbs}
            onChange={(v) => setTargets((t) => ({ ...t, carbs: v }))}
          />
          <TargetField
            label="Grassi"
            unit="g"
            current={profile.targetFatG}
            value={targets.fat}
            onChange={(v) => setTargets((t) => ({ ...t, fat: v }))}
          />
        </div>
        {suggested.data ? (
          <ProteinSuggestion
            proteinG={suggested.data.targets.targetProteinG}
            perKg={suggested.data.proteinPerKg}
            weightKg={suggested.data.weightKg}
            goal={profile.goal}
            current={profile.targetProteinG}
            onApply={handleUseSuggestedProtein}
            applying={updateProfile.isPending}
          />
        ) : null}

        <p className="text-muted-foreground mt-3 text-xs">
          Intervallo accettato: {kcal(profile.targetKcalMin)}–
          {kcal(profile.targetKcalMax)} kcal
        </p>
        <Button
          className="mt-3 w-full rounded-full"
          onClick={handleSaveTargets}
          disabled={updateProfile.isPending}
        >
          Salva obiettivi
        </Button>
      </Panel>

      <Panel className="mt-3">
        <PanelHeader title="Corpo e attività" />
        <div className="mt-3 flex flex-col gap-3">
          <fieldset>
            <legend className="text-muted-foreground mb-1.5 text-xs font-medium">
              Sesso
            </legend>
            <div className="bg-muted grid grid-cols-2 gap-1 rounded-2xl p-1">
              {(Object.keys(SEX_LABELS) as Sex[]).map((sex) => (
                <SegmentOption
                  key={sex}
                  label={SEX_LABELS[sex]}
                  selected={profile.sex === sex}
                  onSelect={() => {
                    if (profile.sex !== sex) updateProfile.mutate({ sex })
                  }}
                />
              ))}
            </div>
            <p className="text-muted-foreground mt-1.5 text-[11px] leading-relaxed">
              Entra nel calcolo di calorie e proteine consigliate.
            </p>
          </fieldset>

          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Data di nascita
            </span>
            <Input
              type="date"
              defaultValue={profile.birthDate ?? ''}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                const v = e.target.value
                if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v !== profile.birthDate) {
                  updateProfile.mutate({ birthDate: v })
                }
              }}
              className="h-11 rounded-2xl"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Livello di attività
            </span>
            <Select
              value={profile.activityLevel}
              onValueChange={(v) =>
                updateProfile.mutate({ activityLevel: v as ActivityLevel })
              }
            >
              <SelectTrigger className="h-11 rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {Object.entries(ACTIVITY_LABELS).map(([key, label]) => (
                  <SelectItem
                    key={key}
                    value={key}
                    hint={ACTIVITY_HINTS[key as ActivityLevel]}
                  >
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Obiettivo
            </span>
            <Select
              value={profile.goal}
              onValueChange={(v) => updateProfile.mutate({ goal: v as Goal })}
            >
              <SelectTrigger className="h-11 rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {Object.entries(GOAL_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs font-medium">
                Altezza (cm)
              </span>
              <Input
                defaultValue={profile.heightCm ?? ''}
                onBlur={(e) => {
                  const v = Number(e.target.value)
                  if (v >= 80 && v <= 250 && v !== profile.heightCm) {
                    updateProfile.mutate({ heightCm: v })
                  }
                }}
                inputMode="decimal"
                className="h-11 rounded-2xl"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs font-medium">
                Peso obiettivo (kg)
              </span>
              <Input
                defaultValue={profile.targetWeightKg ?? ''}
                onBlur={(e) => {
                  const v = Number(e.target.value)
                  if (v >= 25 && v <= 400 && v !== profile.targetWeightKg) {
                    updateProfile.mutate({ targetWeightKg: v })
                  }
                }}
                inputMode="decimal"
                className="h-11 rounded-2xl"
              />
            </label>
          </div>
        </div>

        <Button
          variant="secondary"
          className="mt-3 w-full rounded-full"
          onClick={handleRecalculate}
          disabled={saving}
        >
          <RefreshCw className="size-4" />
          Ricalcola obiettivi
        </Button>
      </Panel>

      <Panel className="mt-3">
        <PanelHeader title="Aspetto" />
        <fieldset className="mt-3">
          <legend className="text-muted-foreground mb-2 text-xs">
            Tema dell'app
          </legend>
          <div className="bg-muted grid grid-cols-3 gap-1 rounded-2xl p-1">
            <SegmentOption
              label="Chiaro"
              icon={<Sun className="size-4" />}
              selected={theme === 'light'}
              onSelect={() => setTheme('light')}
            />
            <SegmentOption
              label="Scuro"
              icon={<Moon className="size-4" />}
              selected={theme === 'dark'}
              onSelect={() => setTheme('dark')}
            />
            <SegmentOption
              label="Sistema"
              icon={<Monitor className="size-4" />}
              selected={theme === 'system'}
              onSelect={() => setTheme('system')}
            />
          </div>
        </fieldset>
      </Panel>

      <Panel className="mt-3">
        <PanelHeader title="Dati e licenze" />
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          I prodotti confezionati arrivano da{' '}
          <a
            href="https://world.openfoodfacts.org"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            Open Food Facts
          </a>
          , database aperto rilasciato con licenza ODbL, da cui arriva anche la
          tassonomia delle categorie usata per gli alimenti generici. I valori
          nutrizionali degli alimenti generici (crudi e cotti) provengono dalle
          tabelle di composizione CREA / BDA-IEO e dalla tabella{' '}
          <a
            href="https://ciqual.anses.fr"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            ANSES-CIQUAL 2020
          </a>
          .
        </p>
      </Panel>

      <Panel className="mt-3">
        <PanelHeader title="Account" />
        <div className="mt-2 flex flex-col gap-1">
          <Button
            variant="ghost"
            className="w-full rounded-full"
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
          >
            <LogOut className="size-4" />
            Esci
          </Button>

          <Button
            variant="ghost"
            className="w-full rounded-full"
            onClick={() => void handleSignOutEverywhere()}
            disabled={signingOutAll}
          >
            <ShieldOff className="size-4" />
            Esci da tutti i dispositivi
          </Button>

          <DeleteAccountDialog
            onDeleted={() => {
              toast.success('Account eliminato')
              logout()
              navigate('/login', { replace: true })
            }}
          />
        </div>
        <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
          Uscire da tutti i dispositivi invalida ogni accesso già fatto, utile se
          hai perso il telefono.
        </p>
      </Panel>

      <PremiumSheet
        open={paywall}
        onOpenChange={setPaywall}
        used={quota?.used}
        limit={quota?.limit}
      />
    </AppShell>
  )
}

/** One cell of a pill switch: theme, sex, anything with two or three choices. */
function SegmentOption({
  label,
  icon,
  selected,
  onSelect,
}: {
  label: string
  icon?: React.ReactNode
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        selected
          ? 'bg-card text-foreground shadow-soft'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

/**
 * The standard protein amount for this body and this goal, next to whatever the
 * user currently has stored. Tolerates a few grams of drift before offering the
 * button: the suggestion moves with every weigh-in.
 */
function ProteinSuggestion({
  proteinG,
  perKg,
  weightKg,
  goal,
  current,
  onApply,
  applying,
}: {
  proteinG: number
  perKg: number
  weightKg: number
  goal: Goal
  current: number
  onApply: (proteinG: number) => void
  applying: boolean
}) {
  const aligned = Math.abs(current - proteinG) <= 3

  return (
    <div className="bg-muted mt-3 flex items-center gap-3 rounded-2xl p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">
          Proteine consigliate: {proteinG} g
        </p>
        <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
          {grams(perKg)} g per kg su {grams(weightKg)} kg —{' '}
          {GOAL_LABELS[goal].toLowerCase()}, con la tua età, sesso e attività.
        </p>
      </div>
      {aligned ? (
        <span className="text-primary-strong shrink-0 text-[11px] font-semibold">
          Allineato
        </span>
      ) : (
        <Button
          variant="secondary"
          className="bg-card h-9 shrink-0 rounded-full px-3 text-xs"
          onClick={() => onApply(proteinG)}
          disabled={applying}
        >
          Usa
        </Button>
      )}
    </div>
  )
}

function TargetField({
  label,
  unit,
  current,
  value,
  onChange,
}: {
  label: string
  unit: string
  current: number
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">
        {label} ({unit})
      </span>
      <Input
        value={value}
        placeholder={String(current)}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        className="h-11 rounded-2xl font-semibold"
      />
    </label>
  )
}
