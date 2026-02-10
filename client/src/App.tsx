import { Switch, Route, useLocation, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Analyse from "@/pages/analyse";
import { Package, BarChart3 } from "lucide-react";
import logoPath from "@assets/5285709155_1770718268325.png";

function Navigation() {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-header-title">Novalayer Order Dashboard</h1>
        </div>
        <img src={logoPath} alt="Novalayer Logo" className="h-16 object-contain" data-testid="img-logo" />
      </div>
      <div className="flex px-6 gap-1">
        <Link href="/">
          <button
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              location === "/" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-dashboard"
          >
            <Package className="w-4 h-4" />
            Bestellungen
          </button>
        </Link>
        <Link href="/analyse">
          <button
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              location === "/analyse" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-analyse"
          >
            <BarChart3 className="w-4 h-4" />
            Analyse
          </button>
        </Link>
      </div>
    </header>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/analyse" component={Analyse} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <Navigation />
          <Router />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
