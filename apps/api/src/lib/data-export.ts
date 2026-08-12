import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  diaryEntries,
  favorites,
  foods,
  groceryItems,
  mealItems,
  meals,
  profiles,
  pushSubscriptions,
  reminders,
  scanEvents,
  users,
  weightLogs,
} from '../db/schema.js'
import { getFamilyIds, groceryVisibility } from './family.js'
import { scanVisibility } from './history.js'

/**
 * Art. 20 portability dump. Password hashes and push encryption keys stay out:
 * they are credentials, not data the person needs to move to another service.
 */
export async function exportPersonalData(userId: string) {
  const familyIds = await getFamilyIds(userId)

  const [account] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      isPremium: users.isPremium,
      premiumSince: users.premiumSince,
      premiumUntil: users.premiumUntil,
      healthConsentAt: users.healthConsentAt,
      privacyVersion: users.privacyVersion,
      termsAcceptedAt: users.termsAcceptedAt,
      ageAttestedAt: users.ageAttestedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1)

  const [
    diary,
    weights,
    customFoods,
    favs,
    grocery,
    scans,
    reminderRows,
    devices,
    savedMeals,
  ] = await Promise.all([
    db.select().from(diaryEntries).where(eq(diaryEntries.userId, userId)),
    db.select().from(weightLogs).where(eq(weightLogs.userId, userId)),
    db
      .select()
      .from(foods)
      .where(and(eq(foods.source, 'custom'), eq(foods.createdBy, userId))),
    db.select().from(favorites).where(eq(favorites.userId, userId)),
    db.select().from(groceryItems).where(groceryVisibility(userId, familyIds)),
    db.select().from(scanEvents).where(scanVisibility(userId, familyIds)),
    db.select().from(reminders).where(eq(reminders.userId, userId)),
    db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        userAgent: pushSubscriptions.userAgent,
        buildId: pushSubscriptions.buildId,
        createdAt: pushSubscriptions.createdAt,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId)),
    db.select().from(meals).where(eq(meals.userId, userId)),
  ])

  const mealIds = savedMeals.map((m) => m.id)
  const ingredients =
    mealIds.length === 0
      ? []
      : await db
          .select()
          .from(mealItems)
          .where(inArray(mealItems.mealId, mealIds))

  return {
    exportedAt: new Date().toISOString(),
    account: account ?? null,
    profile: profile ?? null,
    diary,
    weights,
    customFoods,
    favorites: favs,
    grocery,
    scans,
    reminders: reminderRows,
    devices,
    meals: savedMeals.map((meal) => ({
      ...meal,
      items: ingredients.filter((row) => row.mealId === meal.id),
    })),
  }
}
