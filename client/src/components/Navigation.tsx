import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { siteNavigation } from "@shared/siteNavigation";

export default function Navigation() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // The blog lives in the FOOTER now, not the top nav — so this bar no longer needs the
  // published-article count that used to gate an "Articles" link here. `siteNavigation` is a
  // fixed list; the desktop bar and the mobile drawer both render it.
  const navigation = siteNavigation();

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
