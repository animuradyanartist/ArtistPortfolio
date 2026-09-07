/**
 * THE SCHEMA-HEAL REGRESSION FOR THE COLLECTOR SIGNUP 500.
 *
 * storage.addCollector writes {email, source} and reads every column of `collectors`. The live
 * table predated the `source` column and SELF_HEAL_DDL had NO collectors entry, so production kept
 * throwing `column "source" does not exist` on every signup → HTTP 500 → "Something went wrong".
 * These assertions fail if the boot/dev-sync DDL ever stops providing `collectors.source`.
 */
import { describe, it, expect } from "vitest";
import { SELF_HEAL_DDL } from "./selfHealDdl";

describe("SELF_HEAL_DDL heals the collectors table", () => {
  const ddl = SELF_HEAL_DDL.join("\n");

  it("ensures the collectors table exists (fresh database)", () => {
    expect(ddl).toMatch(/create table if not exists collectors/i);
  });

  it("adds the `source` column the app writes, idempotently (the exact production gap)", () => {
    expect(ddl).toMatch(/alter table collectors add column if not exists source/i);
  });

  it("never contains a destructive statement — it only adds, never drops or deletes", () => {
    for (const stmt of SELF_HEAL_DDL) {
      expect(stmt, stmt).not.toMatch(/\b(drop|delete|truncate|alter\s+column|rename)\b/i);
    }
  });
});
