import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").unique().notNull(),
    name: text("name").notNull(),
    // TODO: add banner fields
    imageUrl: text("image_url").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => [uniqueIndex("clerk_id_idx").on(t.clerkId)]);

export const twitchAccounts = pgTable("twitch_accounts", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
    twitchUserId: text("twitch_user_id").notNull().unique(),
    twitchLogin: text("twitch_login").notNull(),
    twitchDisplayName: text("twitch_display_name").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const categories = pgTable("categories", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => [uniqueIndex("categories_name_unique").on(t.name)]);

export const twitchRecommendationRecords = pgTable("twitch_recommendation_records", {
    dataset: text("dataset").notNull(),
    recordKey: text("record_key").notNull(),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
}, (t) => [primaryKey({ columns: [t.dataset, t.recordKey, t.collectedAt] })]);

export const twitchCurrentStreams = pgTable("twitch_current_streams", {
    id: text("id").primaryKey(),
    viewerCount: integer("viewer_count").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
}, (t) => [index("twitch_current_streams_last_seen_at_idx").on(t.lastSeenAt)]);