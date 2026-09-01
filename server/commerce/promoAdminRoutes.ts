/**
 * ADMIN PROMO-CODE ROUTES — create / edit / activate / delete, all behind `requireAdminAuth`.
 *
 * The customer-facing discount logic is elsewhere (pure, in @shared/commerce/promo). This module is
 * the management surface: it validates admin input to the same rules the checkout enforces, keeps
 * `code_normalized` in step with `code`, and refuses to hard-delete a code any historical order used
 * (deactivate instead) so an order's promo snapshot never dangles.
 */
import type { Express } from "express";
import { requireAdminAuth } from "../auth";
import { hasDatabase } from "../db";
import { normalizePromoCode, STORE_CURRENCIES } from "@shared/commerce/promo";
import type { InsertPromoCode } from "@shared/schema";
import {
  listPromoCodes, getPromoById, createPromoCode, updatePromoCode,
  deletePromoCode, isCodeTaken, isPromoUsed,
} from "./promoRepo";

type Validated<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const APPLIES = new Set(["all", "originals", "prints"]);

/** Parse an admin promo form to a clean insert row, or a field-keyed error map. */
function validatePromoInput(body: unknown): Validated<InsertPromoCode> {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const code = String(b.code ?? "").trim();
  const codeNormalized = normalizePromoCode(code);
  if (!codeNormalized) errors.code = "A code is required.";

  const discountType = String(b.discountType ?? "");
  if (discountType !== "percentage" && discountType !== "fixed") {
    errors.discountType = "Choose percentage or fixed.";
  }

  const discountValue = Number(b.discountValue);
  if (!Number.isFinite(discountValue) || !Number.isInteger(discountValue)) {
    errors.discountValue = "Enter a whole number.";
  } else if (discountType === "percentage") {
    if (discountValue < 1 || discountValue > 100) errors.discountValue = "Percentage must be 1–100.";
  } else if (discountType === "fixed") {
    if (discountValue <= 0) errors.discountValue = "Amount must be greater than 0.";
  }

  // Currency: required + supported for fixed, forced NULL for percentage.
  let currency: string | null = null;
  if (discountType === "fixed") {
    const c = String(b.currency ?? "").trim().toUpperCase();
    if (!c) errors.currency = "A currency is required for a fixed amount.";
    else if (!STORE_CURRENCIES.includes(c as (typeof STORE_CURRENCIES)[number])) {
      errors.currency = `Currency must be one of ${STORE_CURRENCIES.join(", ")}.`;
    } else currency = c;
  }

  const appliesTo = String(b.appliesTo ?? "all");
  if (!APPLIES.has(appliesTo)) errors.appliesTo = "Invalid applicability.";

  const active = b.active === undefined ? true : Boolean(b.active);

  const validFrom = parseDateOrNull(b.validFrom);
  const expiresAt = parseDateOrNull(b.expiresAt);
  if (validFrom === "invalid") errors.validFrom = "Invalid date.";
  if (expiresAt === "invalid") errors.expiresAt = "Invalid date.";
  if (validFrom instanceof Date && expiresAt instanceof Date && expiresAt <= validFrom) {
    errors.expiresAt = "Expiry must be after the valid-from date.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      code, codeNormalized,
      discountType, discountValue,
      currency,
      appliesTo,
      active,
      validFrom: validFrom === "invalid" ? null : validFrom,
      expiresAt: expiresAt === "invalid" ? null : expiresAt,
    } as InsertPromoCode,
  };
}

function parseDateOrNull(v: unknown): Date | null | "invalid" {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

export function registerPromoAdminRoutes(app: Express): void {
  app.get("/api/admin/promo-codes", requireAdminAuth, async (_req, res) => {
    if (!hasDatabase) return res.json([]);
    try {
      return res.json(await listPromoCodes());
    } catch {
      return res.status(500).json({ message: "Could not load promo codes." });
    }
  });

  app.post("/api/admin/promo-codes", requireAdminAuth, async (req, res) => {
    const parsed = validatePromoInput(req.body);
    if (!parsed.ok) return res.status(400).json({ message: "Please check the form.", errors: parsed.errors });
    try {
      if (await isCodeTaken(parsed.value.codeNormalized)) {
        return res.status(409).json({ message: "That code already exists.", errors: { code: "A promo code with this name already exists." } });
      }
      return res.status(201).json(await createPromoCode(parsed.value));
    } catch {
      return res.status(500).json({ message: "Could not create the promo code." });
    }
  });

  app.patch("/api/admin/promo-codes/:id", requireAdminAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id." });
    const parsed = validatePromoInput(req.body);
    if (!parsed.ok) return res.status(400).json({ message: "Please check the form.", errors: parsed.errors });
    try {
      const existing = await getPromoById(id);
      if (!existing) return res.status(404).json({ message: "Not found." });
      if (await isCodeTaken(parsed.value.codeNormalized, id)) {
        return res.status(409).json({ message: "That code already exists.", errors: { code: "A promo code with this name already exists." } });
      }
      const updated = await updatePromoCode(id, parsed.value);
      return res.json(updated);
    } catch {
      return res.status(500).json({ message: "Could not update the promo code." });
    }
  });

  // Dedicated activate/deactivate — the preferred, non-destructive control (mirrors the blog /publish).
  app.post("/api/admin/promo-codes/:id/active", requireAdminAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id." });
    const active = Boolean((req.body ?? {}).active);
    try {
      const updated = await updatePromoCode(id, { active });
      if (!updated) return res.status(404).json({ message: "Not found." });
      return res.json(updated);
    } catch {
      return res.status(500).json({ message: "Could not update the promo code." });
    }
  });

  app.delete("/api/admin/promo-codes/:id", requireAdminAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id." });
    try {
      const existing = await getPromoById(id);
      if (!existing) return res.status(404).json({ message: "Not found." });
      // NEVER hard-delete a code a historical order used — deactivate keeps the order's snapshot honest.
      if (await isPromoUsed(id, existing.codeNormalized)) {
        return res.status(409).json({
          code: "promo-in-use",
          message: "This code has been used on an order and cannot be deleted. Deactivate it instead.",
        });
      }
      await deletePromoCode(id);
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Could not delete the promo code." });
    }
  });
}
