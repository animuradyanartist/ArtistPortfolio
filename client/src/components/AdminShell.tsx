/**
 * ADMIN SHELL — the dark-sidebar chrome around every admin section.
 *
 * Replaces the old horizontal tab bar with a fixed navy sidebar (brand · sectioned nav · View
 * site / Logout) and a light content area. Section switching still drives the same `activeTab`
 * state in AdminPage — the shell only owns the navigation chrome, not the content. Route items
 * (Orders, SEO) navigate to their own pages; everything else selects an in-page section.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Home, Map, Palette, Layers, FileText, Landmark, Images, User, Mail,
  Users, MessageSquare, ShoppingBag, Search, ExternalLink, LogOut, Menu, X,
  type LucideIcon,
} from "lucide-react";

interface TabItem { key: string; label: string; icon: LucideIcon }
interface RouteItem { label: string; icon: LucideIcon; href: string }
interface NavGroup { heading: string; tabs?: TabItem[]; routes?: RouteItem[] }

// The real admin sections, grouped. Tab keys match AdminPage's `activeTab` union.
const NAV: NavGroup[] = [
  {
    heading: "Content",
    tabs: [
      { key: "homepage", label: "Homepage", icon: Home },
      { key: "path", label: "The Path", icon: Map },
      { key: "artworks", label: "Artworks", icon: Palette },
      { key: "prints", label: "Prints", icon: Layers },
      { key: "articles", label: "Articles", icon: FileText },
      { key: "exhibitions", label: "Exhibitions", icon: Landmark },
      { key: "gallery", label: "Gallery", icon: Images },
      { key: "artist", label: "About Artist", icon: User },
      { key: "contact", label: "Contact", icon: Mail },
    ],
  },
  {
    heading: "Audience",
    tabs: [
      { key: "collectors", label: "Collectors", icon: Users },
      { key: "messages", label: "Messages", icon: MessageSquare },
    ],
  },
  {
    heading: "Commerce",
    routes: [
      { label: "Orders", icon: ShoppingBag, href: "/admin/orders" },
      { label: "SEO", icon: Search, href: "/admin/seo" },
    ],
  },
];

const itemBase =
  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left";

export default function AdminShell({
  active,
  onSelectTab,
  onLogout,
  children,
}: {
  active: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false); // mobile drawer
  const isDevEnv = import.meta.env.DEV;

  const NavList = (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
      {NAV.map((group) => (
        <div key={group.heading}>
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {group.heading}
          </p>
          <div className="space-y-0.5">
            {group.tabs?.map((t) => {
              const Icon = t.icon;
              const isActive = active === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => { onSelectTab(t.key); setOpen(false); }}
                  className={`${itemBase} ${
                    isActive
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.9} />
                  {t.label}
                </button>
              );
            })}
            {group.routes?.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.href}
                  type="button"
                  onClick={() => setLocation(r.href)}
                  className={`${itemBase} text-slate-400 hover:bg-slate-800/60 hover:text-white`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.9} />
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const Sidebar = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-200">
      <div className="flex items-center justify-between px-5 h-16 shrink-0 border-b border-slate-800">
        <span className="font-playfair text-lg tracking-[0.12em] text-white">ANI MURADYAN</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="lg:hidden text-slate-400 hover:text-white"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      {NavList}
      <div className="shrink-0 border-t border-slate-800 px-3 py-4 space-y-0.5">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className={`${itemBase} text-slate-400 hover:bg-slate-800/60 hover:text-white`}
        >
          <ExternalLink className="w-[18px] h-[18px] shrink-0" strokeWidth={1.9} />
          View Site
        </button>
        <button
          type="button"
          onClick={onLogout}
          className={`${itemBase} text-slate-400 hover:bg-slate-800/60 hover:text-white`}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" strokeWidth={1.9} />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {Sidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">{Sidebar}</div>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {isDevEnv ? (
          <div className="w-full bg-amber-400 text-amber-900 text-center py-2 px-4 font-semibold text-sm tracking-wide">
            ⚠ TEST ENVIRONMENT — Changes here do NOT affect the live animuradyan.com website
          </div>
        ) : (
          <div className="w-full bg-emerald-600 text-white text-center py-1.5 px-4 text-xs font-medium tracking-wide">
            ● PRODUCTION — animuradyan.com
          </div>
        )}

        {/* Mobile top bar with menu toggle */}
        <div className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-slate-200 bg-white">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="text-slate-700">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-playfair text-base tracking-wide text-slate-900">ANI MURADYAN</span>
        </div>

        <main className="flex-1">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
