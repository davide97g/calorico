import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Camera, Check, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MacroDonut } from '@/components/charts/macro-donut'
import { useCompleteOnboarding, useEstimateTargets } from '@/hooks/use-profile'
import {
  ACTIVITY_HINTS,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  SEX_LABELS,
  kcal,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { requestCameraPermission } from '@/lib/camera-permission'
import type { ActivityLevel, Goal, Sex, TargetEstimate } from '@/lib/types'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { mutate: estimateTargets } = useEstimateTargets()
  const complete = useCompleteOnboarding()

  const [form, setForm] = useState({
    sex: 'male' as Sex,
    birthDate: '1995-01-01',
    heightCm: '178',
    weightKg: '76',
    targetWeightKg: '72',
    activityLevel: 'moderate' as ActivityLevel,
    goal: 'lose' as Goal,
  })
  const [preview, setPreview] = useState<TargetEstimate | null>(null)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [requestingCamera, setRequestingCamera] = useState(false)

  const payload = useMemo(
    () => ({
      sex: form.sex,
      birthDate: form.birthDate,
      heightCm: Number(form.heightCm),
      weightKg: Number(form.weightKg.replace(',', '.')),
      activityLevel: form.activityLevel,
      goal: form.goal,
      targetWeightKg: Number(form.targetWeightKg.replace(',', '.')) || undefined,
    }),
    [form],
  )

  const valid =
    payload.heightCm >= 80 &&
    payload.heightCm <= 250 &&
    payload.weightKg >= 25 &&
    payload.weightKg <= 400 &&
    /^\d{4}-\d{2}-\d{2}$/.test(payload.birthDate)

  // Recompute the preview whenever the inputs settle.
  useEffect(() => {
    if (!valid) return
    const id = setTimeout(() => {
      estimateTargets(payload, { onSuccess: setPreview })
    }, 250)
    return () => clearTimeout(id)
  }, [payload, valid, estimateTargets])

  const handleSubmit = () => {
    complete.mutate(payload, {
      onSuccess: () => {
        toast.success('Tutto pronto!')
        navigate('/', { replace: true })
      },
      onError: () => toast.error('Non è stato possibile salvare il profilo'),
    })
  }

  const handleCameraPermission = async () => {
    setRequestingCamera(true)
    const result = await requestCameraPermission()
    setRequestingCamera(false)
    if (result.ok) {
      setCameraEnabled(true)
      toast.success('Fotocamera pronta per la scansione')
    } else {
      toast.info(result.message)
    }
  }

  return (
    <AppShell nav={false}>
      <header className="mt-2 mb-4 text-center">
        <h1 className="text-2xl leading-tight font-extrabold tracking-tight">
          Impostiamo i tuoi obiettivi
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Serve solo un minuto. Potrai modificare tutto più tardi.
        </p>
      </header>

      <Panel>
        <PanelHeader title="Chi sei" />
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(SEX_LABELS) as Sex[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm((f) => ({ ...f, sex: s }))}
                className={cn(
                  'rounded-md py-3 text-sm font-medium transition-colors',
                  form.sex === s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground',
                )}
              >
                {SEX_LABELS[s]}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Data di nascita
            </span>
            <Input
              type="date"
              value={form.birthDate}
              onChange={(e) =>
                setForm((f) => ({ ...f, birthDate: e.target.value }))
              }
              className="h-11 rounded-md"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <NumField
              label="Altezza (cm)"
              value={form.heightCm}
              onChange={(v) => setForm((f) => ({ ...f, heightCm: v }))}
            />
            <NumField
              label="Peso (kg)"
              value={form.weightKg}
              onChange={(v) => setForm((f) => ({ ...f, weightKg: v }))}
            />
            <NumField
              label="Obiettivo (kg)"
              value={form.targetWeightKg}
              onChange={(v) => setForm((f) => ({ ...f, targetWeightKg: v }))}
            />
          </div>
        </div>
      </Panel>

      <Panel className="mt-3">
        <PanelHeader title="Quanto ti muovi" />
        <div className="mt-3 flex flex-col gap-2">
          {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setForm((f) => ({ ...f, activityLevel: level }))}
              className={cn(
                'flex flex-col items-start rounded-md px-4 py-2.5 text-left transition-colors',
                form.activityLevel === level
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground',
              )}
            >
              <span className="text-sm font-semibold">
                {ACTIVITY_LABELS[level]}
              </span>
              <span
                className={cn(
                  'text-xs',
                  form.activityLevel === level
                    ? 'text-primary-foreground/70'
                    : 'text-muted-foreground',
                )}
              >
                {ACTIVITY_HINTS[level]}
              </span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel className="mt-3">
        <PanelHeader title="Cosa vuoi ottenere" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(Object.keys(GOAL_LABELS) as Goal[]).map((goal) => (
            <button
              key={goal}
              type="button"
              onClick={() => setForm((f) => ({ ...f, goal }))}
              className={cn(
                'rounded-md px-2 py-3 text-xs font-medium transition-colors',
                form.goal === goal
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground',
              )}
            >
              {GOAL_LABELS[goal]}
            </button>
          ))}
        </div>
      </Panel>

      {preview ? (
        <Panel className="bg-primary text-primary-foreground mt-3">
          <div className="flex items-center gap-2">
            <span className="bg-primary-foreground/12 flex size-8 items-center justify-center rounded-full">
              <Sparkles className="size-4" />
            </span>
            <h2 className="text-base font-semibold">Il tuo piano</h2>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <MacroDonut
              carbsG={preview.targetCarbsG}
              fatG={preview.targetFatG}
              proteinG={preview.targetProteinG}
              size={88}
              withLabels={false}
            />
            <div>
              <p className="tabular text-display-sm leading-none font-extrabold">
                {kcal(preview.targetKcal)}
                <span className="ml-1 text-sm font-semibold">kcal</span>
              </p>
              <p className="text-primary-foreground/75 mt-1.5 text-xs">
                Mantenimento stimato: {kcal(preview.maintenanceKcal)} kcal
              </p>
              <p className="tabular mt-1 text-xs font-medium">
                P {preview.targetProteinG} g · C {preview.targetCarbsG} g · G{' '}
                {preview.targetFatG} g
              </p>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel className="mt-3">
        <div className="flex items-center gap-3">
          <span className="bg-secondary text-primary-strong flex size-10 shrink-0 items-center justify-center rounded-full">
            {cameraEnabled ? <Check className="size-5" /> : <Camera className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">Scansione codici a barre</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Attiva ora la fotocamera. Potrai riprovare più tardi.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="h-10 shrink-0 rounded-md px-3"
            onClick={() => void handleCameraPermission()}
            disabled={cameraEnabled || requestingCamera}
          >
            {cameraEnabled ? 'Pronta' : 'Attiva'}
          </Button>
        </div>
      </Panel>

      <Button
        className="mt-4 mb-4 h-13 w-full rounded-full text-base font-semibold"
        onClick={handleSubmit}
        disabled={!valid || complete.isPending}
      >
        Inizia a tracciare
        <ArrowRight className="size-5" />
      </Button>
    </AppShell>
  )
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-micro font-medium">
        {label}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="h-11 rounded-md font-semibold"
      />
    </label>
  )
}
