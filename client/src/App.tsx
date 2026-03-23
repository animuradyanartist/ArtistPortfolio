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
// import PrintsPage from "@/pages/PrintsPage";
// import PrintArtworkPage from "@/pages/PrintArtworkPage";
import AboutPage from "@/pages/AboutPage";
import ExhibitionsPage from "@/pages/ExhibitionsPage";
import GalleryPage from "@/pages/GalleryPage";
import ContactPage from "@/pages/ContactPage";
import AdminPage from "@/pages/AdminPage";
import CreateArtworkPage from "@/pages/CreateArtworkPage";
import EditArtworkPage from "@/pages/EditArtworkPage";
import CreatePrintPage from "@/pages/CreatePrintPage";
import EditPrintPage from "@/pages/EditPrintPage";
import NotFound from "@/pages/not-found";
import SeoArtworkPage from "@/pages/SeoArtworkPage";

function CanonicalManager() {
  const [location] = useLocation();
  useEffect(() => {
    updateCanonicalUrl(location);
  }, [location]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/artworks" component={ArtworksPage} />
      <Route path="/artworks/:id" component={ArtworkDetailPage} />{/* :id accepts both numeric IDs and slug strings */}
      <Route path="/prints">{() => <Redirect to="/" />}</Route>
      <Route path="/prints/:id">{() => <Redirect to="/" />}</Route>
      <Route path="/about" component={AboutPage} />
      <Route path="/exhibitions" component={ExhibitionsPage} />
      <Route path="/gallery" component={GalleryPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/create-artwork" component={CreateArtworkPage} />
      <Route path="/admin/edit-artwork/:id" component={EditArtworkPage} />
      <Route path="/admin/create-print" component={CreatePrintPage} />
      <Route path="/admin/edit-print/:id" component={EditPrintPage} />
      <Route path="/:seoSlug" component={SeoArtworkPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-soft-white">
          <CanonicalManager />
          <Navigation />
          <main>
            <Router />
          </main>
          <Toaster />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
