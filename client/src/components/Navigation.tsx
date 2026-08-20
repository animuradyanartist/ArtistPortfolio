import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Menu, X, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAfterPaint } from "@/lib/afterPaint";
import { Button } from "@/components/ui/button";
import type { BlogPost } from "@shared/schema";
import { siteNavigation } from "@shared/siteNavigation";

export default function Navigation() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ARTICLES APPEARS ONLY WHEN THERE IS SOMETHING TO READ (§1).
  //
  // /api/blog returns published posts only, so the count is the condition — no separate
  // flag to set, and unpublishing the last article removes the link on its own. The query
  // shares BlogPage's cache key and the client sets staleTime: Infinity, so this costs one
  // request per session rather than one per page.
  //
  // AND NOT BEFORE THE PAGE THE VISITOR ASKED FOR HAS PAINTED. This ran on mount, so every
  // page on the site — including an artwork page, where the painting is the whole point —
  // spent a round trip deciding whether a navigation link should exist before it showed
  // anything. Gated on the browser being idle, it is the last thing the page does rather
  // than one of the first. Nothing else changes: still one request per session, still
  // driven by the published count.
  const navReady = useAfterPaint();
  const { data: publishedPosts } = useQuery<BlogPost[]>({
    queryKey: ["/api/blog"],
    enabled: navReady,
  });
  const navigation = siteNavigation(publishedPosts?.length);

  const isActive = (href: string) => {
    if (href === "/" && location === "/") return true;
    if (href !== "/" && location.startsWith(href)) return true;
    return false;
  };

  return (
    <nav className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/">
              <div className="font-playfair text-2xl font-semibold text-deep-blue cursor-pointer">
                Ani Muradyan
              </div>
            </Link>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <div className="flex items-baseline space-x-8">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`transition-colors duration-300 font-medium ${
                    isActive(item.href)
                      ? "text-deep-blue border-b-2 border-deep-blue pb-1"
                      : "text-charcoal hover:text-deep-blue"
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </div>
            <CartLink />
          </div>
          
          <div className="flex items-center gap-2 md:hidden">
            <CartLink />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-charcoal hover:text-deep-blue"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </Button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 transition-colors duration-300 ${
                  isActive(item.href)
                    ? "text-deep-blue bg-warm-beige"
                    : "text-charcoal hover:text-deep-blue hover:bg-warm-beige"
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

/**
 * THE CART, IN THE NAVIGATION — and invisible until it holds something.
 *
 * A permanently visible cart on a portfolio reads as a shop; an empty one reads as a shop
 * with nothing in it. So it appears only once a work has been added, which is also the only
 * moment it is useful.
 */
function CartLink() {
  const { count } = useCart();
  if (count === 0) return null;
  return (
    <Link href="/cart" aria-label={`Cart, ${count} work${count === 1 ? "" : "s"}`}>
      <span className="relative inline-flex items-center text-charcoal hover:text-deep-blue transition-colors cursor-pointer">
        <ShoppingBag size={20} />
        <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-deep-blue text-white text-[11px] leading-[18px] text-center tabular-nums">
          {count}
        </span>
      </span>
    </Link>
  );
}
