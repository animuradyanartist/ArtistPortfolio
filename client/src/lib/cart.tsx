/**
 * THE CART HOLDS IDS. NOTHING ELSE IS TRUSTED.
 *
 * localStorage is a text file the visitor can edit, so this stores artwork ids and a chosen
 * destination country — identity and preference, never money. Prices, availability and
 * shipping shown anywhere in the cart come from `POST /api/commerce/cart/validate`, which
 * re-reads the rows, and the checkout recomputes everything again before Stripe is called.
 * A tampered localStorage can therefore change what you are LOOKING at and never what you
 * are CHARGED.
 *
 * ORIGINALS ARE QUANTITY ONE, structurally. The cart is a Set of ids: adding a work twice is
 * the same as adding it once, so there is no quantity to display and no +/- control to build.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { addPrintLine, removePrintLine, setPrintLineQty, cartCount, type PrintCartLine } from "./cartLines";

export type { PrintCartLine } from "./cartLines";

const STORAGE_KEY = "am.cart.v1";
const PRINTS_KEY = "am.cart.prints.v1";
const COUNTRY_KEY = "am.cart.country.v1";

interface CartState {
  // ── originals (quantity-one; a Set of artwork ids) ──
  ids: number[];
  has: (id: number) => boolean;
  add: (id: number) => void;
  remove: (id: number) => void;
  // ── prints (variant + quantity) ──
  prints: PrintCartLine[];
  addPrint: (line: PrintCartLine) => void;
  removePrint: (variantId: number) => void;
  setPrintQuantity: (variantId: number, quantity: number) => void;
  // ── shared ──
  count: number;           // originals + total print quantity
  clear: () => void;
  country: string | null;
  setCountry: (c: string) => void;
}

const CartContext = createContext<CartState | null>(null);

function readIds(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Defensive on read: anything that is not a positive integer is discarded rather than
    // carried into a request.
    return Array.from(new Set(parsed.filter((n): n is number => Number.isInteger(n) && (n as number) > 0)));
  } catch { return []; }
}

function readPrints(): PrintCartLine[] {
  try {
    const raw = localStorage.getItem(PRINTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Defensive on read: keep only well-formed lines; clamp quantity to 1..10.
    return parsed
      .filter((l): l is PrintCartLine => Boolean(l) && Number.isInteger((l as PrintCartLine).variantId) && (l as PrintCartLine).variantId > 0)
      .map((l) => ({ ...l, quantity: Math.min(10, Math.max(1, Math.floor(Number(l.quantity) || 1))) }));
  } catch { return []; }
}

function readCountry(): string | null {
  try { return localStorage.getItem(COUNTRY_KEY); } catch { return null; }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<number[]>([]);
  const [prints, setPrints] = useState<PrintCartLine[]>([]);
  // KNOWN ON THE FIRST RENDER, because something asks for a shipping quote on it.
  //
  // This was read in the mount effect with the ids. That is right for the ids — the cart
  // badge is visible chrome, and settling it after mount keeps the first paint stable. It
  // was wrong for the country: PurchasePanel turns the country into a query key, so a value
  // that arrives one render late costs a whole extra round trip to /api/commerce/quote
  // before any price appears. The country is never rendered by the server and this app
  // client-renders (createRoot, not hydrateRoot), so reading it during render is safe.
  const [country, setCountryState] = useState<string | null>(readCountry);

  // Read once on mount rather than during render, so server-rendered HTML and the first
  // client paint agree.
  useEffect(() => {
    setIds(readIds());
    setPrints(readPrints());
  }, []);

  const persist = useCallback((next: number[]) => {
    setIds(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* quota or private mode */ }
  }, []);

  const persistPrints = useCallback((next: PrintCartLine[]) => {
    setPrints(next);
    try { localStorage.setItem(PRINTS_KEY, JSON.stringify(next)); } catch { /* quota or private mode */ }
  }, []);

  const addPrint = useCallback((line: PrintCartLine) => {
    setPrints((prev) => {
      const next = addPrintLine(prev, line);
      try { localStorage.setItem(PRINTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const removePrint = useCallback((variantId: number) => {
    setPrints((prev) => {
      const next = removePrintLine(prev, variantId);
      try { localStorage.setItem(PRINTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const setPrintQuantity = useCallback((variantId: number, quantity: number) => {
    setPrints((prev) => {
      const next = setPrintLineQty(prev, variantId, quantity);
      try { localStorage.setItem(PRINTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const add = useCallback((id: number) => {
    setIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const remove = useCallback((id: number) => {
    setIds((prev) => {
      const next = prev.filter((n) => n !== id);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const clear = useCallback(() => { persist([]); persistPrints([]); }, [persist, persistPrints]);

  const setCountry = useCallback((c: string) => {
    setCountryState(c);
    try { localStorage.setItem(COUNTRY_KEY, c); } catch { /* ignore */ }
  }, []);

  const value = useMemo<CartState>(() => ({
    ids, has: (id) => ids.includes(id), add, remove,
    prints, addPrint, removePrint, setPrintQuantity,
    count: cartCount(ids, prints),
    clear, country, setCountry,
  }), [ids, add, remove, prints, addPrint, removePrint, setPrintQuantity, clear, country, setCountry]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
