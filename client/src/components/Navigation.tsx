import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Menu, X } from "lucide-react";
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
  const { data: publishedPosts } = useQuery<BlogPost[]>({ queryKey: ["/api/blog"] });
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
          
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-8">
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
          </div>
          
          <div className="md:hidden">
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