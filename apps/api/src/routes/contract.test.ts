import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  authResponse,
  breakdownResponse,
  dayStats,
  diaryDay,
  diaryEntry,
  familiesResponse,
  familyInvite,
  food,
  foodImage,
  foodPortions,
  grocerySuggestionsResponse,
  groceryResponse,
  invitePreview,
  meResponse,
  mealAnalysis,
  notificationSettings,
  periodsResponse,
  premiumStatus,
  profile as profileContract,
  recentFood,
  reminder,
  savedMeal,
  scansResponse,
  statsResponse,
  suggestedTargets,
  targetEstimate,
  visionStatus,
  weightLog,
  weightResponse,
} from '@calorico/contracts'
import { db } from '../db/index.js'
import { scanEvents } from '../db/schema.js'
import { expectContract } from '../test/contract.js'
import {
  auth,
  createUser,
  hasDb,
  resetDb,
  startApp,
  stopApp,
  type TestUser,
} from '../test/harness.js'

/**
 * Every response the web app reads, parsed through the contract it types itself
 * from.
 *
 * This is the suite that makes `@calorico/contracts` worth having. Before it, the
 * client's idea of a payload was a hand-written mirror that nothing compared
 * against the real thing: a renamed field compiled fine on both sides and
 * surfaced as `undefined` on a screen. Now a handler and the contract can only
 * disagree here.
 *
 * It is deliberately one file rather than assertions sprinkled through the other
 * suites. Those test behaviour — what the ranking prefers, what the quota
 * refuses — and stay readable by not also policing shapes. This one tests one
 * thing, for the whole surface, and reads as the list of what is under contract.
 *
 * Empty collections prove nothing about the shape of a row, so everything here
 * runs against one account with real data in it.
 */
describe.skipIf(!hasDb)('response contracts', () => {
  let app: FastifyInstance
  let user: TestUser
  /** Filled by the setup below and read by the assertions further down. */
  const ids = { foodId: '', familyId: '', inviteToken: '' }
  const day = new Date().toISOString().slice(0, 10)

  const get = async (url: string) => {
    const res = await app.inject({ method: 'GET', url, headers: auth(user) })
    expect(res.statusCode, `GET ${url}`).toBe(200)
    return res.json()
  }

  const post = async (
    url: string,
    payload: Record<string, unknown>,
    expected = 201,
  ) => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: auth(user),
      payload,
    })
    expect(res.statusCode, `POST ${url}`).toBe(expected)
    return res.json()
  }

  beforeAll(async () => {
    app = await startApp()
    await resetDb()
    user = await createUser(app)

    // Onboarding first: it writes the targets and the starting weigh-in that
    // half the payloads below carry.
    await post(
      '/api/profile/onboarding',
      {
        sex: 'male',
        birthDate: '1995-01-01',
        heightCm: 178,
        weightKg: 76,
        activityLevel: 'moderate',
        goal: 'lose',
        targetWeightKg: 72,
      },
      200,
    )

    const created = await post('/api/foods', {
      name: 'Torta della nonna',
      kcal100: 380,
      protein100: 6,
      carbs100: 45,
      fat100: 18,
      servingSizeG: 120,
      isLiquid: false,
    })
    ids.foodId = (created as { id: string }).id

    await post('/api/diary', {
      foodId: ids.foodId,
      day,
      meal: 'lunch',
      quantityG: 150,
    })
    // Favourited, so `isFavorite` is a real value in the payloads below rather
    // than the absent field the contract also allows.
    const favorited = await app.inject({
      method: 'PUT',
      url: `/api/foods/${ids.foodId}/favorite`,
      headers: auth(user),
    })
    expect(favorited.statusCode).toBe(200)

    await post('/api/meals', {
      name: 'Colazione di sempre',
      meal: 'breakfast',
      items: [{ foodId: ids.foodId, quantityG: 100 }],
    })

    await post('/api/grocery', { name: 'Pane', quantity: 2 })

    const family = await post('/api/families', { name: 'Casa' })
    ids.familyId = (family as { id: string }).id
    const invite = await post(`/api/families/${ids.familyId}/invites`, {})
    ids.inviteToken = (invite as { token: string }).token

    await post('/api/notifications/reminders/defaults', {}, 200)

    // The barcode path needs Open Food Facts, which is switched off in tests, so
    // the feed gets its row the way the lookup would have written it.
    await db.insert(scanEvents).values({
      userId: user.id,
      familyId: ids.familyId,
      kind: 'barcode',
      foodId: ids.foodId,
      barcode: '8001234567890',
      nameSnapshot: 'Torta della nonna',
    })
  })

  afterAll(async () => {
    await stopApp(app)
  })

  it('POST /auth/register and POST /auth/login', async () => {
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'contract@calorico.test',
        password: 'test-password-1',
        name: 'Contract',
        healthConsent: true,
        ageAttested: true,
      },
    })
    expect(registered.statusCode).toBe(201)
    expectContract(authResponse, registered.json())

    const loggedIn = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'contract@calorico.test', password: 'test-password-1' },
    })
    expect(loggedIn.statusCode).toBe(200)
    expectContract(authResponse, loggedIn.json())
  })

  it('GET /auth/me', async () => {
    const me = expectContract(meResponse, await get('/api/auth/me'))
    // The contract allows a null profile; this account has been onboarded.
    expect(me.profile).not.toBeNull()
    expect(me.needsOnboarding).toBe(false)
  })

  it('GET /profile and its target endpoints', async () => {
    expectContract(profileContract, await get('/api/profile'))
    expectContract(suggestedTargets, await get('/api/profile/suggested'))
    expectContract(
      targetEstimate,
      await post(
        '/api/profile/estimate',
        {
          sex: 'female',
          birthDate: '1990-06-15',
          heightCm: 165,
          weightKg: 62,
          activityLevel: 'light',
          goal: 'maintain',
        },
        200,
      ),
    )
  })

  it('GET /foods/search, /recent, /favorites', async () => {
    const items = z.object({ items: z.array(food) })
    expectContract(items, await get('/api/foods/search?q=torta&local=true'))
    // The favourites list sends plain catalogue rows: `isFavorite` is implied by
    // being on it, and the contract marks the field optional for exactly that.
    const favorites = expectContract(items, await get('/api/foods/favorites'))
    expect(favorites.items).toHaveLength(1)

    const recents = expectContract(
      z.object({ items: z.array(recentFood) }),
      await get('/api/foods/recent?include=all'),
    )
    expect(recents.items.length).toBeGreaterThan(0)
  })

  it('GET /foods/:id, its portions and its images', async () => {
    // The detail route is the one that resolves `isFavorite`.
    const detail = expectContract(food, await get(`/api/foods/${ids.foodId}`))
    expect(detail.isFavorite).toBe(true)
    const portions = expectContract(
      foodPortions,
      await get(`/api/foods/${ids.foodId}/portions`),
    )
    expect(portions.lastQuantityG).toBe(150)
    expectContract(
      z.object({ items: z.array(foodImage) }),
      await get(`/api/foods/${ids.foodId}/images`),
    )
  })

  it('GET /diary and the entries it returns', async () => {
    const diary = expectContract(diaryDay, await get(`/api/diary?day=${day}`))
    expect(diary.entries).toHaveLength(1)
    expect(diary.byMeal.lunch).toHaveLength(1)
    expect(diary.targets).not.toBeNull()
  })

  it('POST /diary and POST /diary/batch', async () => {
    expectContract(
      diaryEntry,
      await post('/api/diary', {
        foodId: ids.foodId,
        day,
        meal: 'snack',
        quantityG: 40,
      }),
    )
    expectContract(
      z.object({ entries: z.array(diaryEntry) }),
      await post('/api/diary/batch', {
        day,
        meal: 'dinner',
        items: [
          { foodId: ids.foodId, quantityG: 60 },
          {
            newFood: {
              name: 'Minestrone della casa',
              kcal100: 45,
              protein100: 2,
              carbs100: 7,
              fat100: 1,
              isLiquid: false,
            },
            quantityG: 300,
          },
        ],
      }),
    )
  })

  it('every stats endpoint', async () => {
    const range = `from=${day}&to=${day}`
    expectContract(statsResponse, await get(`/api/stats/daily?${range}`))
    expectContract(dayStats, await get(`/api/stats/day?day=${day}`))
    expectContract(
      periodsResponse,
      await get(`/api/stats/periods?unit=week&${range}`),
    )
    expectContract(periodsResponse, await get(`/api/stats/periods?unit=month&${range}`))
    expectContract(breakdownResponse, await get(`/api/stats/breakdown?${range}`))
  })

  it('GET /weight and PUT /weight', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/weight',
      headers: auth(user),
      payload: { day, weightKg: 75.4, note: 'dopo colazione' },
    })
    expect(res.statusCode).toBe(200)
    expectContract(weightLog, res.json())

    const feed = expectContract(weightResponse, await get('/api/weight'))
    expect(feed.latest).not.toBeNull()
  })

  it('GET /meals', async () => {
    const meals = expectContract(
      z.object({ items: z.array(savedMeal) }),
      await get('/api/meals'),
    )
    expect(meals.items[0]?.items.length).toBe(1)
  })

  it('GET /grocery and its suggestions', async () => {
    const list = expectContract(groceryResponse, await get('/api/grocery'))
    expect(list.items).toHaveLength(1)
    // A suggestion is only offered for a line the list has held and lost, so the
    // row is ticked off first.
    const id = list.items[0]!.id
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/grocery/${id}`,
      headers: auth(user),
      payload: { completed: true },
    })
    expect(patched.statusCode).toBe(200)
    expectContract(
      grocerySuggestionsResponse,
      await get('/api/grocery/suggestions?q=pan'),
    )
  })

  it('GET /families, its invites and the public preview', async () => {
    const families = expectContract(
      familiesResponse,
      await get('/api/families'),
    )
    expect(families.families[0]?.members).toHaveLength(1)
    expect(families.activeFamilyId).toBe(ids.familyId)

    expectContract(
      z.object({ invite: familyInvite.nullable() }),
      await get(`/api/families/${ids.familyId}/invites`),
    )

    // No token: an invite is read before anyone has signed in.
    const preview = await app.inject({
      method: 'GET',
      url: `/api/families/invites/${ids.inviteToken}`,
    })
    expect(preview.statusCode).toBe(200)
    expectContract(invitePreview, preview.json())
  })

  it('GET /scans', async () => {
    const scans = expectContract(scansResponse, await get('/api/scans'))
    expect(scans.items).toHaveLength(1)
    expect(scans.items[0]?.scannedBy.id).toBe(user.id)
  })

  it('GET /notifications', async () => {
    const settings = expectContract(
      notificationSettings,
      await get('/api/notifications'),
    )
    expect(settings.presets.length).toBeGreaterThan(0)
    expect(settings.reminders.length).toBeGreaterThan(0)
  })

  it('the reminder write endpoints', async () => {
    const created = expectContract(
      reminder,
      await post('/api/notifications/reminders', {
        kind: 'custom',
        label: 'Bevi acqua',
        atMinutes: 600,
      }),
    )
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/notifications/reminders/${created.id}`,
      headers: auth(user),
      payload: { atMinutes: 660 },
    })
    expect(patched.statusCode).toBe(200)
    expectContract(reminder, patched.json())
  })

  it('GET /premium and GET /vision/status', async () => {
    expectContract(premiumStatus, await get('/api/premium'))
    expectContract(visionStatus, await get('/api/vision/status'))
  })

  it('POST /vision/meal', async () => {
    // The stub provider answers from a fixture, so nothing is spent.
    expectContract(
      mealAnalysis,
      await post(
        '/api/vision/meal',
        { image: 'a'.repeat(64), contentType: 'image/webp' },
        200,
      ),
    )
  })
})
