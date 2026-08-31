import { describe, it, expect } from "vitest";
import {
  canTransition, ADMIN_SETTABLE, ORDER_STATUSES, BUYER_TIMELINE_STEPS,
  timelineReachedIndex, isExceptionState, adminMayManageStatus,
} from "./orderStatus";

describe("adminMayManageStatus — manual lifecycle is originals-only", () => {
  it("an ORIGINAL order's status is admin-settable", () => {
    expect(adminMayManageStatus("artwork")).toBe(true);
    expect(adminMayManageStatus(null)).toBe(true);
  });
  it("a PRINT order's status is NOT admin-settable (Prodigi-driven)", () => {
    expect(adminMayManageStatus("print")).toBe(false);
  });
});

describe("order status machine — packed", () => {
  it("includes packed as a real status", () => {
    expect(ORDER_STATUSES).toContain("packed");
  });
  it("allows paid → preparing → packed → shipped → delivered", () => {
    expect(canTransition("paid", "preparing")).toBe(true);
    expect(canTransition("preparing", "packed")).toBe(true);
    expect(canTransition("packed", "shipped")).toBe(true);
    expect(canTransition("shipped", "delivered")).toBe(true);
  });
  it("still refuses paid → cancelled (money that arrived is refunded, not cancelled)", () => {
    expect(canTransition("paid", "cancelled")).toBe(false);
  });
  it("admin may set packed, but never paid or refunded", () => {
    expect(ADMIN_SETTABLE).toContain("packed");
    expect(ADMIN_SETTABLE).not.toContain("paid");
    expect(ADMIN_SETTABLE).not.toContain("refunded");
  });
});

describe("buyer timeline", () => {
  it("has the six collector-facing steps in order", () => {
    expect(BUYER_TIMELINE_STEPS.map((s) => s.key)).toEqual(
      ["confirmed", "preparing", "packed", "shipped", "in_transit", "delivered"],
    );
  });
  it("maps statuses onto the ladder (shipped implies in transit)", () => {
    expect(timelineReachedIndex("checkout_created")).toBe(-1);
    expect(timelineReachedIndex("paid")).toBe(0);
    expect(timelineReachedIndex("preparing")).toBe(1);
    expect(timelineReachedIndex("packed")).toBe(2);
    expect(timelineReachedIndex("shipped")).toBe(4);
    expect(timelineReachedIndex("delivered")).toBe(5);
  });
  it("keeps cancelled/refunded off the ladder (the UI shows a banner instead)", () => {
    expect(timelineReachedIndex("cancelled")).toBe(-1);
    expect(timelineReachedIndex("refunded")).toBe(-1);
  });
});

describe("exception overlay", () => {
  it("recognises only the two overlays", () => {
    expect(isExceptionState("delayed")).toBe(true);
    expect(isExceptionState("delivery_issue")).toBe(true);
    expect(isExceptionState("paid")).toBe(false);
    expect(isExceptionState(null)).toBe(false);
    expect(isExceptionState("")).toBe(false);
  });
});
