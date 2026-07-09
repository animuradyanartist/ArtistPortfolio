import type { ReactNode } from "react";

/** Small uppercase tracked eyebrow label used across sections */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] tracking-[0.3em] uppercase text-stone-500 mb-4">{children}</p>
  );
}

/** Outlined, letter-spaced action link/button in the design's style */
export function OutlineButton({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block border border-stone-800 px-6 py-3 text-[11px] tracking-[0.2em] uppercase text-stone-900 hover:bg-stone-900 hover:text-stone-50 transition-colors duration-300">
      {children}
    </span>
  );
}

/** Small underlined "VIEW WORK"-style link */
export function ViewLink({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] tracking-[0.2em] uppercase text-stone-700 border-b border-stone-400 pb-0.5 hover:text-stone-900 hover:border-stone-800 transition-colors">
      {children}
    </span>
  );
}
