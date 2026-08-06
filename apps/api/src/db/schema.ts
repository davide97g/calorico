import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { relations, sql, type SQL } from 'drizzle-orm'

export const sexEnum = pgEnum('sex', ['male', 'female'])
export const activityEnum = pgEnum('activity_level', [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
])
export const goalEnum = pgEnum('goal', ['lose', 'maintain', 'gain'])
export const mealEnum = pgEnum('meal', ['breakfast', 'lunch', 'dinner', 'snack'])
export const foodSourceEnum = pgEnum('food_source', [
  'off', // Open Food Facts (packaged / branded)
  'generic', // composition tables (raw & cooked foods)
  'custom', // created by a user
])
/**
 * Every shot comes from Open Food Facts. Users used to be able to add their own,
 * hosted on R2; that was removed, along with the bucket.
 */
export const foodImageKindEnum = pgEnum('food_image_kind', [
  'front', // packshot from Open Food Facts
  'ingredients', // ingredients list shot
  'nutrition', // nutrition table shot
])
export const scanKindEnum = pgEnum('scan_kind', [
  'barcode', // product scanned from its EAN/UPC
  'photo', // meal photo sent to the vision provider
])
/**
 * What a reminder is about. The kind is what decides whether the reminder can
 * skip itself — see lib/reminders/due.ts — and which copy it sends:
 *
 *  - `meal`   pairs with the `meal` column and looks at that meal's entries
 *  - `review` looks at the day's total against the lower end of the target band
 *  - `weight` looks for a weigh-in on that day
 *  - `custom` is a user's own text and never skips: nothing tells us it is done
 */
export const reminderKindEnum = pgEnum('reminder_kind', [
  'meal',
  'review',
  'weight',
  'custom',
])

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
    /**
     * Bumped to invalidate every token already issued to this user. Tokens carry
     * the value they were signed with, so a mismatch means "signed before the
     * last password change or sign-out-everywhere" and fails verification.
     */
    tokenVersion: integer('token_version').notNull().default(0),
    /**
     * Lifts the daily cap on meal-photo analysis. Set by the fake checkout — no
     * payment provider is wired up yet, see routes/premium.ts.
     */
    isPremium: boolean('is_premium').notNull().default(false),
    premiumSince: timestamp('premium_since', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('users_email_unique').on(sql`lower(${t.email})`)],
)

export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  sex: sexEnum('sex').notNull().default('male'),
  birthDate: date('birth_date'),
  heightCm: real('height_cm'),
  startWeightKg: real('start_weight_kg'),
  targetWeightKg: real('target_weight_kg'),
  activityLevel: activityEnum('activity_level').notNull().default('moderate'),
  goal: goalEnum('goal').notNull().default('maintain'),
  /** Daily targets. Computed on onboarding, then user-editable. */
  targetKcal: integer('target_kcal').notNull().default(2000),
  targetProteinG: integer('target_protein_g').notNull().default(120),
  targetCarbsG: integer('target_carbs_g').notNull().default(200),
  targetFatG: integer('target_fat_g').notNull().default(65),
  /** Acceptable band drawn on the calories chart, e.g. 1700-1850. */
  targetKcalMin: integer('target_kcal_min').notNull().default(1900),
  targetKcalMax: integer('target_kcal_max').notNull().default(2100),
  locale: text('locale').notNull().default('it'),
  /**
   * IANA zone the reminders are read in, sent by the browser when notifications
   * are switched on. A reminder is a wall-clock time ("13:00"), so without this
   * the server has no way to know when 13:00 is — the photo quota gets away with
   * a rolling window precisely because it never has to.
   */
  timezone: text('timezone').notNull().default('Europe/Rome'),
  /**
   * Master switch. Off means the scheduler skips this user entirely, and their
   * reminders keep their own settings instead of having to be deleted.
   */
  notificationsEnabled: boolean('notifications_enabled')
    .notNull()
    .default(false),
  /**
   * Where new shared rows (grocery items, scans) are written. Reads are merged
   * across every family the user belongs to, but a write needs one target.
   * Null means "no family yet", i.e. keep it private.
   */
  activeFamilyId: uuid('active_family_id').references(() => families.id, {
    onDelete: 'set null',
  }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * A household. Members are all equal: anyone can invite, rename, and edit the
 * shared list. Only the grocery list and the scan feed are shared — the diary,
 * weights and targets stay strictly per user.
 */
export const families = pgTable('families', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdBy: uuid('created_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const familyMembers = pgTable(
  'family_members',
  {
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('family_members_pk').on(t.familyId, t.userId),
    index('family_members_user_idx').on(t.userId),
  ],
)

/** Reusable join link. One active invite per family; rotating revokes the old. */
export const familyInvites = pgTable(
  'family_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('family_invites_token_unique').on(t.token),
    index('family_invites_family_idx').on(t.familyId),
  ],
)

export const foods = pgTable(
  'foods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: foodSourceEnum('source').notNull().default('off'),
    /** EAN/UPC. Unique per non-null value; generic foods have none. */
    barcode: text('barcode'),
    name: text('name').notNull(),
    /**
     * Extra search terms: the other number of the noun, the English name,
     * regional synonyms. Generic foods carry them because the catalogue names
     * them once, in one number ("Pesche"), while people type whichever form
     * they think of. Never shown in the UI — matched only.
     */
    aliases: text('aliases').array(),
    brand: text('brand'),
    /** Free-form category path from OFF, or our own for generic foods. */
    category: text('category'),
    /** Thumbnail used nowhere in lists any more; kept as the gallery's first shot. */
    imageUrl: text('image_url'),
    /**
     * When we last asked Open Food Facts for this product's photo set. Null
     * means "never", which is what triggers the lazy backfill on first view.
     */
    imagesSyncedAt: timestamp('images_synced_at', { withTimezone: true }),
    /** Nutriments are always stored per 100 g (or 100 ml). */
    kcal100: real('kcal_100').notNull(),
    protein100: real('protein_100').notNull().default(0),
    carbs100: real('carbs_100').notNull().default(0),
    sugars100: real('sugars_100'),
    fat100: real('fat_100').notNull().default(0),
    satFat100: real('sat_fat_100'),
    fiber100: real('fiber_100'),
    salt100: real('salt_100'),
    /** Default portion offered in the UI (e.g. 30 g biscuit serving). */
    servingSizeG: real('serving_size_g'),
    servingLabel: text('serving_label'),
    /** Net weight/volume printed on the pack, when OFF provides it. */
    packageSizeG: real('package_size_g'),
    packageSizeLabel: text('package_size_label'),
    /** 'g' for solids, 'ml' for drinks — affects the unit shown. */
    unit: text('unit').notNull().default('g'),
    isLiquid: boolean('is_liquid').notNull().default(false),
    countries: text('countries').array(),
    /** Raw OFF payload subset, handy for debugging bad imports. */
    raw: jsonb('raw'),
    verified: boolean('verified').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('foods_barcode_unique')
      .on(t.barcode)
      .where(sql`${t.barcode} is not null`),
    index('foods_name_trgm').using('gin', sql`${t.name} gin_trgm_ops`),
    /**
     * Matches the expression food-search.ts searches aliases with, character
     * for character — an expression index is only used by a query that spells
     * it the same way. `food_alias_haystack` exists because `array_to_string`
     * is merely STABLE and Postgres refuses to index it; the function is
     * declared IMMUTABLE in the same migration that creates this index.
     */
    index('foods_aliases_trgm').using(
      'gin',
      sql`food_alias_haystack(${t.aliases}) gin_trgm_ops`,
    ),
    index('foods_brand_trgm').using('gin', sql`${t.brand} gin_trgm_ops`),
    index('foods_source_idx').on(t.source),
  ],
)

export const foodImages = pgTable(
  'food_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'cascade' }),
    kind: foodImageKindEnum('kind').notNull().default('front'),
    url: text('url').notNull(),
    width: integer('width'),
    height: integer('height'),
    /** Ascending display order; the OFF front shot sorts first. */
    sort: integer('sort').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('food_images_food_idx').on(t.foodId, t.sort),
    uniqueIndex('food_images_food_url_unique').on(t.foodId, t.url),
  ],
)

export const diaryEntries = pgTable(
  'diary_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    foodId: uuid('food_id').references(() => foods.id, {
      onDelete: 'set null',
    }),
    /** Local calendar day the entry belongs to — not a timestamp, on purpose. */
    day: date('day').notNull(),
    meal: mealEnum('meal').notNull().default('snack'),
    quantityG: real('quantity_g').notNull(),
    /**
     * Denormalised snapshot: a diary entry must never change because the
     * underlying OFF product was edited or deleted upstream.
     */
    nameSnapshot: text('name_snapshot').notNull(),
    brandSnapshot: text('brand_snapshot'),
    kcal: real('kcal').notNull(),
    proteinG: real('protein_g').notNull().default(0),
    carbsG: real('carbs_g').notNull().default(0),
    fatG: real('fat_g').notNull().default(0),
    fiberG: real('fiber_g'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('diary_user_day_idx').on(t.userId, t.day)],
)

export const weightLogs = pgTable(
  'weight_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    weightKg: real('weight_kg').notNull(),
    bodyFatPct: real('body_fat_pct'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('weight_user_day_unique').on(t.userId, t.day)],
)

export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('favorites_pk').on(t.userId, t.foodId)],
)

export const groceryItems = pgTable(
  'grocery_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Who added the row. Attribution, not ownership — see listId. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null means a private list; set means the whole family sees the row. */
    familyId: uuid('family_id').references(() => families.id, {
      onDelete: 'cascade',
    }),
    /**
     * The list this row lives in. Generated rather than derived in queries so
     * the one-active-row rule below can stay a plain unique index that
     * `on conflict (list_id, dedupe_key)` can still name as a target.
     */
    listId: uuid('list_id').generatedAlwaysAs(
      (): SQL => sql`coalesce(${groceryItems.familyId}, ${groceryItems.userId})`,
    ),
    foodId: uuid('food_id').references(() => foods.id, {
      onDelete: 'set null',
    }),
    /** Stable key used to merge repeated active adds and barcode scans. */
    dedupeKey: text('dedupe_key').notNull(),
    /** Snapshots keep the shopping row useful if the catalogue food changes. */
    nameSnapshot: text('name_snapshot').notNull(),
    brandSnapshot: text('brand_snapshot'),
    quantity: integer('quantity').notNull().default(1),
    completed: boolean('completed').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('grocery_list_active_item_unique')
      .on(t.listId, t.dedupeKey)
      .where(sql`${t.completed} = false`),
    index('grocery_list_status_idx').on(t.listId, t.completed, t.createdAt),
  ],
)

/**
 * One row per scan, shared with the family that was active at scan time.
 * Photo scans record only the labels the vision model returned — the image
 * itself is never stored, here or anywhere else.
 */
export const scanEvents = pgTable(
  'scan_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').references(() => families.id, {
      onDelete: 'set null',
    }),
    kind: scanKindEnum('kind').notNull(),
    foodId: uuid('food_id').references(() => foods.id, { onDelete: 'set null' }),
    barcode: text('barcode'),
    /** Product name, or a joined summary of the meal's items. */
    nameSnapshot: text('name_snapshot').notNull(),
    brandSnapshot: text('brand_snapshot'),
    /** Photo scans only: `[{ label, quantityG }]`. Never nutrition figures. */
    items: jsonb('items').$type<{ label: string; quantityG: number }[]>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('scan_events_family_idx').on(t.familyId, t.createdAt),
    index('scan_events_user_idx').on(t.userId, t.createdAt),
  ],
)

/**
 * One row per browser that accepted notifications. The endpoint is the push
 * service's own URL for that browser and is globally unique, which is what makes
 * it the natural key: the same browser re-subscribing must update the row rather
 * than pile up dead ones, and a phone handed to another account has to move.
 *
 * Rows are deleted, not flagged, the moment a push service answers 404/410 —
 * that is the only signal we get that a subscription is gone for good.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    /** Client public key and auth secret; both required to encrypt a payload. */
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    /** Only to tell devices apart in the UI. Never parsed. */
    userAgent: text('user_agent'),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('push_subscriptions_endpoint_unique').on(t.endpoint),
    index('push_subscriptions_user_idx').on(t.userId),
  ],
)

/**
 * A wall-clock reminder, as many per user as they want (capped by
 * MAX_REMINDERS_PER_USER so one account cannot make the scheduler unbounded).
 *
 * The time is stored as minutes since local midnight rather than a `time`
 * column: the scheduler compares it against the user's local clock, computed by
 * Postgres from `profiles.timezone`, and integer minutes is what that comparison
 * wants on both sides.
 */
export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: reminderKindEnum('kind').notNull().default('custom'),
    /** Set only for `kind = 'meal'`; it is the meal the skip check looks at. */
    meal: mealEnum('meal'),
    /** Shown in the notification and in the list. Editable, preset-seeded. */
    label: text('label').notNull(),
    /** Minutes since local midnight, 0–1439. 13:00 is 780. */
    atMinutes: integer('at_minutes').notNull(),
    /** Days it fires on, Postgres `extract(dow)` convention: 0 = Sunday. */
    weekdays: integer('weekdays')
      .array()
      .notNull()
      .default([0, 1, 2, 3, 4, 5, 6]),
    /**
     * Stay quiet when the thing being nudged is already done — lunch logged,
     * the day already at target, today's weight on file. Meaningless for
     * `custom`, which is why the routes force it false there.
     */
    skipIfLogged: boolean('skip_if_logged').notNull().default(true),
    enabled: boolean('enabled').notNull().default(true),
    /**
     * The local day this reminder last went out. It is the once-a-day lock: the
     * scheduler claims a reminder by writing today's date here, so a restart
     * inside the grace window cannot send twice.
     */
    lastSentOn: date('last_sent_on'),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('reminders_user_idx').on(t.userId),
    // The scheduler's own lookup: enabled rows, ordered by nothing in
    // particular, filtered on the day they last fired.
    index('reminders_enabled_idx').on(t.enabled, t.atMinutes),
  ],
)

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
  entries: many(diaryEntries),
  weights: many(weightLogs),
  groceryItems: many(groceryItems),
  memberships: many(familyMembers),
  scans: many(scanEvents),
  reminders: many(reminders),
  pushSubscriptions: many(pushSubscriptions),
}))

export const remindersRelations = relations(reminders, ({ one }) => ({
  user: one(users, {
    fields: [reminders.userId],
    references: [users.id],
  }),
}))

export const pushSubscriptionsRelations = relations(
  pushSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [pushSubscriptions.userId],
      references: [users.id],
    }),
  }),
)

export const familiesRelations = relations(families, ({ many }) => ({
  members: many(familyMembers),
  invites: many(familyInvites),
  groceryItems: many(groceryItems),
  scans: many(scanEvents),
}))

export const familyMembersRelations = relations(familyMembers, ({ one }) => ({
  family: one(families, {
    fields: [familyMembers.familyId],
    references: [families.id],
  }),
  user: one(users, {
    fields: [familyMembers.userId],
    references: [users.id],
  }),
}))

export const scanEventsRelations = relations(scanEvents, ({ one }) => ({
  user: one(users, {
    fields: [scanEvents.userId],
    references: [users.id],
  }),
  food: one(foods, {
    fields: [scanEvents.foodId],
    references: [foods.id],
  }),
  family: one(families, {
    fields: [scanEvents.familyId],
    references: [families.id],
  }),
}))

export const diaryEntriesRelations = relations(diaryEntries, ({ one }) => ({
  food: one(foods, {
    fields: [diaryEntries.foodId],
    references: [foods.id],
  }),
  user: one(users, {
    fields: [diaryEntries.userId],
    references: [users.id],
  }),
}))

export const groceryItemsRelations = relations(groceryItems, ({ one }) => ({
  food: one(foods, {
    fields: [groceryItems.foodId],
    references: [foods.id],
  }),
  user: one(users, {
    fields: [groceryItems.userId],
    references: [users.id],
  }),
  family: one(families, {
    fields: [groceryItems.familyId],
    references: [families.id],
  }),
}))

export type User = typeof users.$inferSelect
export type Profile = typeof profiles.$inferSelect
export type Food = typeof foods.$inferSelect
export type NewFood = typeof foods.$inferInsert
export type FoodImage = typeof foodImages.$inferSelect
export type NewFoodImage = typeof foodImages.$inferInsert
export type DiaryEntry = typeof diaryEntries.$inferSelect
export type WeightLog = typeof weightLogs.$inferSelect
export type GroceryItem = typeof groceryItems.$inferSelect
export type Family = typeof families.$inferSelect
export type FamilyMember = typeof familyMembers.$inferSelect
export type FamilyInvite = typeof familyInvites.$inferSelect
export type ScanEvent = typeof scanEvents.$inferSelect
export type NewScanEvent = typeof scanEvents.$inferInsert
export type Reminder = typeof reminders.$inferSelect
export type NewReminder = typeof reminders.$inferInsert
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
