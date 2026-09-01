/**
 * PROMO CODE PERSISTENCE — thin data access over the `promo_codes` table.
 *
 * All the decision logic (validation, discount maths) is pure and lives in @shared/commerce/promo;
 * this module only reads and writes rows. Every function fails safe when the database is absent
 * (local preview mode has no DATABASE_URL): reads return empty/null, writes throw a clear error.
 */
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { db, hasDatabase } from "../db";
import { promoCodes, orders, type PromoCode, type InsertPromoCode } from "@shared/schema";
import { normalizePromoCode } from "@shared/commerce/promo";

function requireDb() {
  if (!hasDatabase || !db) throw new Error("promo codes are unavailable (no database configured)");
  return db;
}

/** The one lookup checkout uses: match a customer-typed code, case-insensitively, by its normal form. */
export async function getPromoByCode(rawCode: string): Promise<PromoCode | null> {
  if (!hasDatabase || !db) return null;
  const normalized = normalizePromoCode(rawCode);
  if (!normalized) return null;
  const rows = await db.select().from(promoCodes).where(eq(promoCodes.codeNormalized, normalized)).limit(1);
  return rows[0] ?? null;
}

export async function getPromoById(id: number): Promise<PromoCode | null> {
  if (!hasDatabase || !db) return null;
  const rows = await db.select().from(promoCodes).where(eq(promoCodes.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listPromoCodes(): Promise<PromoCode[]> {
  if (!hasDatabase || !db) return [];
  return db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
}

/** Is a normalized code already taken by ANOTHER row? (uniqueness guard for create/edit). */
export async function isCodeTaken(codeNormalized: string, exceptId?: number): Promise<boolean> {
  if (!hasDatabase || !db) return false;
  const where = exceptId
    ? and(eq(promoCodes.codeNormalized, codeNormalized), ne(promoCodes.id, exceptId))
    : eq(promoCodes.codeNormalized, codeNormalized);
  const rows = await db.select({ id: promoCodes.id }).from(promoCodes).where(where).limit(1);
  return rows.length > 0;
}

export async function createPromoCode(input: InsertPromoCode): Promise<PromoCode> {
  const d = requireDb();
  const rows = await d.insert(promoCodes).values(input).returning();
  return rows[0];
}

export async function updatePromoCode(id: number, patch: Partial<InsertPromoCode>): Promise<PromoCode | null> {
  const d = requireDb();
  const rows = await d.update(promoCodes)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(promoCodes.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deletePromoCode(id: number): Promise<boolean> {
  const d = requireDb();
  const rows = await d.delete(promoCodes).where(eq(promoCodes.id, id)).returning({ id: promoCodes.id });
  return rows.length > 0;
}

/**
 * Has this code EVER been used on an order? Matched by the id snapshot AND the normalized code text,
 * so a historical order (whose promo row may since have been edited) still counts. Used to block a
 * hard delete — deactivate instead — so history never loses the promo it references.
 */
export async function isPromoUsed(id: number, codeNormalized: string): Promise<boolean> {
  if (!hasDatabase || !db) return false;
  const rows = await db.select({ id: orders.id }).from(orders)
    .where(or(eq(orders.promoCodeId, id), eq(sql`upper(${orders.promoCode})`, codeNormalized)))
    .limit(1);
  return rows.length > 0;
}
