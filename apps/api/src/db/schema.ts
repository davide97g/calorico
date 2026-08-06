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
export const foodImageKindEnum = pgEnum('food_image_kind', [
  'front', // packshot from Open Food Facts
  'ingredients', // ingredients list shot
  'nutrition', // nutrition table shot
  'user', // photo taken by a user, hosted by us on R2
])
export const scanKindEnum = pgEnum('scan_kind', [
  'barcode', // product scanned from its EAN/UPC
  'photo', // meal photo sent to the vision provider
])

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
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
    /**
     * Null for the shots that came with the product (Open Food Facts), which
     * everyone sees. Set for a photo a user took: only its author gets it back,
     * because "the jar on my shelf" is a private landmark, not product data.
     */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    kind: foodImageKindEnum('kind').notNull().default('user'),
    url: text('url').notNull(),
    /** R2 object key — only set for images we host, so we can delete them. */
    storageKey: text('storage_key'),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),
    /** Ascending display order; the OFF front shot sorts first. */
    sort: integer('sort').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('food_images_food_idx').on(t.foodId, t.sort),
    index('food_images_user_idx').on(t.userId),
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
}))

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
