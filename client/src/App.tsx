import { useEffect } from "react";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Navigation from "@/components/Navigation";
import { updateCanonicalUrl } from "@/lib/seo";
import HomePage from "@/pages/HomePage";
import ArtworksPage from "@/pages/ArtworksPage";
import ArtworkDetailPage from "@/pages/ArtworkDetailPage";
import CollectionPage from "@/pages/CollectionPage";
import PrintsPage from "@/pages/PrintsPage";
import PrintDetailPage from "@/pages/PrintDetailPage";
import AboutPage from "@/pages/AboutPage";
import PathPage from "@/pages/PathPage";
import ExhibitionsPage from "@/pages/ExhibitionsPage";
import GalleryPage from "@/pages/GalleryPage";
import ContactPage from "@/pages/ContactPage";
import AdminPage from "@/pages/AdminPage";
import CreateArtworkPage from "@/pages/CreateArtworkPage";
import EditArtworkPage from "@/pages/EditArtworkPage";
import CreatePrintPage from "@/pages/CreatePrintPage";
import EditPrintPage from "@/pages/EditPrintPage";
import AdminPrintVariantsPage from "@/pages/AdminPrintVariantsPage";
import NotFound from "@/pages/not-found";
import CartPage from "@/pages/CartPage";
import CheckoutPage from "@/pages/CheckoutPage";
import OrderConfirmationPage from "@/pages/OrderConfirmationPage";
import TrackOrderPage from "@/pages/TrackOrderPage";
import AdminOrdersPage from "@/pages/AdminOrdersPage";
import AdminOrderDetailPage from "@/pages/AdminOrderDetailPage";
import { CartProvider } from "@/lib/cart";
import { captureAttribution } from "@/lib/commerceAnalytics";
import SeoArtworkPage from "@/pages/SeoArtworkPage";
import BlogPage from "@/pages/BlogPage";
import BlogPostPage from "@/pages/BlogPostPage";

function CanonicalManager() {
  const [location] = useLocation();
  useEffect(() => {
    updateCanonicalUrl(location);
  }, [location]);
  return null;
}

// Open every navigated page from the top (wouter has no scroll restoration).
function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/artworks" component={ArtworksPage} />
      <Route path="/artworks/:id" component={ArtworkDetailPage} />{/* :id accepts both numeric IDs and slug strings */}
      <Route path="/prints" component={PrintsPage} />
      <Route path="/prints/:slug" component={PrintDetailPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/path" component={PathPage} />
      <Route path="/exhibitions" component={ExhibitionsPage} />
      <Route path="/gallery" component={GalleryPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/create-artwork" component={CreateArtworkPage} />
      <Route path="/admin/edit-artwork/:id" component={EditArtworkPage} />
      <Route path="/admin/create-print" component={CreatePrintPage} />
      <Route path="/admin/edit-print/:id" component={EditPrintPage} />
      <Route path="/admin/edit-print/:id/variants" component={AdminPrintVariantsPage} />
      <Route path="/blog" component={BlogPage} />
      <Route path="/blog/:slug" component={BlogPostPage} />
      {/* Direct sales. Declared BEFORE the /:seoSlug catch-all, which would otherwise
          swallow /cart and /checkout exactly as it once would have swallowed /blog. */}
      <Route path="/cart" component={CartPage} />
      <Route path="/checkout" component={CheckoutPage} />
      <Route path="/order/:reference" component={OrderConfirmationPage} />
      <Route path="/track/:token" component={TrackOrderPage} />
      <Route path="/admin/orders" component={AdminOrdersPage} />
      <Route path="/admin/orders/:id" component={AdminOrderDetailPage} />
      {/* Keep the catch-all LAST: /:seoSlug would otherwise swallow /blog. */}
      <Route path="/collections/:slug" component={CollectionPage} />
      <Route path="/:seoSlug" component={SeoArtworkPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

/** Records utm_* and the landing path once per session, so an order can say where it came
 *  from. Renders nothing. */
function AttributionCapture() {
  useEffect(() => { captureAttribution(); }, []);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
       <CartProvider>
        <div className="min-h-screen bg-soft-white">
          <CanonicalManager />
          <AttributionCapture />
          <ScrollToTop />
          <Navigation />
          <main>
            <Router />
          </main>
          <Toaster />
        </div>
       </CartProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
