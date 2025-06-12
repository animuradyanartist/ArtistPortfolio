import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Navigation from "@/components/Navigation";
import HomePage from "@/pages/HomePage";
import ArtworksPage from "@/pages/ArtworksPage";
import AboutPage from "@/pages/AboutPage";
import ExhibitionsPage from "@/pages/ExhibitionsPage";
import ContactPage from "@/pages/ContactPage";
import AdminPage from "@/pages/AdminPage";
import CreateArtworkPage from "@/pages/CreateArtworkPage";
import EditArtworkPage from "@/pages/EditArtworkPage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/artworks" component={ArtworksPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/exhibitions" component={ExhibitionsPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/create-artwork" component={CreateArtworkPage} />
      <Route path="/admin/edit-artwork/:id" component={EditArtworkPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-soft-white">
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
