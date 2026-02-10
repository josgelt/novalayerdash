import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Order } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Upload, Package, Truck, Calendar, Globe, Filter, Trash2, Edit3, X, Check, Search, FileText, AlertTriangle, Download, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Versendet") {
    return <Badge variant="default" className="bg-emerald-600 text-white"><Check className="w-3 h-3 mr-1" />Versendet</Badge>;
  }
  return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"><Package className="w-3 h-3 mr-1" />Offen</Badge>;
}

function PlatformBadge({ platform }: { platform: string }) {
  if (platform === "eBay") {
    return <Badge variant="outline" className="text-[#e53238] border-[#e53238]/30">eBay</Badge>;
  }
  return <Badge variant="outline" className="text-[#ff9900] border-[#ff9900]/30">Amazon</Badge>;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("Offen");

  const [shippingCarrier, setShippingCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shippingDate, setShippingDate] = useState("");

  const [importResult, setImportResult] = useState<{ imported: number; duplicates: number; duplicateIds: string[] } | null>(null);

  const [shippingImportOpen, setShippingImportOpen] = useState(false);
  const [shippingImportResult, setShippingImportResult] = useState<{ updated: number; notFound: string[]; fuzzyMatched: string[]; ambiguous: string[] } | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);

  const [amazonFetchOpen, setAmazonFetchOpen] = useState(false);
  const [amazonDateFrom, setAmazonDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [amazonDateTo, setAmazonDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [amazonFetchResult, setAmazonFetchResult] = useState<{ imported: number; duplicates: number; duplicateIds: string[]; apiErrors?: string[] } | null>(null);

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (countryFilter && countryFilter !== "all") params.set("country", countryFilter);
    if (platformFilter && platformFilter !== "all") params.set("platform", platformFilter);
    return params.toString();
  };

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders", dateFrom, dateTo, countryFilter, platformFilter],
    queryFn: async () => {
      const qs = buildQueryString();
      const res = await fetch(`/api/orders${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/orders/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setEditOrder(null);
      toast({ title: "Bestellung aktualisiert" });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Aktualisierung fehlgeschlagen", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setDeleteConfirm(null);
      toast({ title: "Bestellung gelöscht" });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/orders");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setDeleteAllConfirm(false);
      toast({ title: "Alle Bestellungen gelöscht" });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Löschen fehlgeschlagen", variant: "destructive" });
    },
  });

  const handleImport = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/orders/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      const result = await res.json();
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      if (result.duplicates === 0) {
        toast({ title: "Import erfolgreich", description: `${result.imported} Bestellungen importiert` });
        setImportOpen(false);
        setImportResult(null);
      }
    } catch (error: any) {
      toast({ title: "Import fehlgeschlagen", description: error.message, variant: "destructive" });
    }
  };

  const handleShippingImport = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/orders/import-shipping", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      const result = await res.json();
      setShippingImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      const hasIssues = (result.notFound?.length > 0) || (result.fuzzyMatched?.length > 0) || (result.ambiguous?.length > 0);
      if (!hasIssues) {
        toast({ title: "Versandliste importiert", description: `${result.updated} Bestellungen aktualisiert` });
        setShippingImportOpen(false);
        setShippingImportResult(null);
      }
    } catch (error: any) {
      toast({ title: "Import fehlgeschlagen", description: error.message, variant: "destructive" });
    }
  };

  const [amazonFetching, setAmazonFetching] = useState(false);

  const handleAmazonFetch = async () => {
    setAmazonFetching(true);
    setAmazonFetchResult(null);
    try {
      const res = await apiRequest("POST", "/api/orders/fetch-amazon", {
        createdAfter: new Date(amazonDateFrom).toISOString(),
        createdBefore: new Date(amazonDateTo + "T23:59:59").toISOString(),
      });
      const result = await res.json();
      setAmazonFetchResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      if (result.duplicates === 0 && (!result.apiErrors || result.apiErrors.length === 0)) {
        toast({ title: "Amazon Import erfolgreich", description: `${result.imported} Bestellungen importiert` });
        setAmazonFetchOpen(false);
        setAmazonFetchResult(null);
      }
    } catch (error: any) {
      toast({ title: "Amazon Abruf fehlgeschlagen", description: error.message, variant: "destructive" });
    } finally {
      setAmazonFetching(false);
    }
  };

  const handleSaveShipping = () => {
    if (!editOrder) return;
    updateMutation.mutate({
      id: editOrder.id,
      data: {
        shippingCarrier: shippingCarrier || null,
        trackingNumber: trackingNumber || null,
        shippingDate: shippingDate || null,
      },
    });
  };

  const filteredOrders = orders.filter((o) => {
    if (statusFilter && statusFilter !== "all" && o.status !== statusFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.firstName?.toLowerCase().includes(q) ||
      o.lastName?.toLowerCase().includes(q) ||
      o.orderId?.toLowerCase().includes(q) ||
      o.orderItemId?.toLowerCase().includes(q) ||
      o.email?.toLowerCase().includes(q) ||
      o.productName?.toLowerCase().includes(q) ||
      o.sku?.toLowerCase().includes(q) ||
      o.city?.toLowerCase().includes(q)
    );
  });

  const countries = Array.from(new Set(orders.map(o => o.country).filter(Boolean))).sort();

  const totalOrders = filteredOrders.length;
  const openOrders = filteredOrders.filter(o => o.status === "Offen").length;
  const shippedOrders = filteredOrders.filter(o => o.status === "Versendet").length;

  return (
    <div>
      <main className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-primary/10">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gesamt</p>
                <p className="text-2xl font-bold" data-testid="text-total-orders">{totalOrders}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-amber-100 dark:bg-amber-900/30">
                <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Offen</p>
                <p className="text-2xl font-bold" data-testid="text-open-orders">{openOrders}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-emerald-100 dark:bg-emerald-900/30">
                <Truck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Versendet</p>
                <p className="text-2xl font-bold" data-testid="text-shipped-orders">{shippedOrders}</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Filter:</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Von</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
                data-testid="input-date-from"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Bis</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
                data-testid="input-date-to"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Land</label>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger className="w-32" data-testid="select-country">
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {countries.map(c => (
                    <SelectItem key={c} value={c!}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Plattform</label>
              <Select value={platformFilter} onValueChange={setPlatformFilter}>
                <SelectTrigger className="w-32" data-testid="select-platform">
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="Amazon">Amazon</SelectItem>
                  <SelectItem value="eBay">eBay</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32" data-testid="select-status">
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="Offen">Offen</SelectItem>
                  <SelectItem value="Versendet">Versendet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Suche</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Name, Artikel, SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-48"
                  data-testid="input-search"
                />
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                data-testid="button-export-logoix"
                onClick={async () => {
                  const res = await fetch("/api/orders/export-logoix");
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({ message: "Export fehlgeschlagen" }));
                    toast({ title: "Export fehlgeschlagen", description: err.message, variant: "destructive" });
                    return;
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `logoix_export_${new Date().toISOString().split("T")[0]}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast({ title: "Export erfolgreich", description: "LogoiX CSV wurde heruntergeladen." });
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Export LogoiX
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button data-testid="button-import">
                    <Upload className="w-4 h-4 mr-2" />
                    Importieren
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setImportOpen(true)} data-testid="button-import-file">
                    <FileText className="w-4 h-4 mr-2" />
                    Bestellungen (TSV/CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShippingImportOpen(true)} data-testid="button-import-shipping">
                    <Truck className="w-4 h-4 mr-2" />
                    Versandliste (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setAmazonFetchOpen(true); setAmazonFetchResult(null); }} data-testid="button-fetch-amazon">
                    <Globe className="w-4 h-4 mr-2" />
                    Amazon SP-API
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </Card>

        <Card>
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="w-12 h-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">Keine Bestellungen</h3>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                Importiere deine ersten Bestellungen über den "Importieren" Button oben.
              </p>
            </div>
          ) : (
            <ScrollArea className="w-full">
              <div className="min-w-[1400px]">
                <table className="w-full text-xs" data-testid="table-orders">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-2 py-1.5 text-xs font-medium text-muted-foreground">Plattform</th>
                      <th className="text-left px-2 py-1.5 text-xs font-medium text-muted-foreground">Bestelldatum</th>
                      <th className="text-left px-2 py-1.5 text-xs font-medium text-muted-foreground">Order ID</th>
                      <th className="text-left px-2 py-1.5 text-xs font-medium text-muted-foreground">Artikel</th>
                      <th className="text-left px-2 py-1.5 text-xs font-medium text-muted-foreground">Menge</th>
                      <th className="text-left px-2 py-1.5 text-xs font-medium text-muted-foreground">Kunde</th>
                      <th className="text-left px-2 py-1.5 text-xs font-medium text-muted-foreground">Adresse</th>
                      <th className="text-left px-2 py-1.5 text-xs font-medium text-muted-foreground">Land</th>
                      <th className="text-left px-2 py-1.5 text-xs font-medium text-muted-foreground">Versender</th>
                      <th className="text-left px-2 py-1.5 text-xs font-medium text-muted-foreground">Versand</th>
                      <th className="text-left px-2 py-1.5 text-xs font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-2 py-1.5 text-xs font-medium text-muted-foreground">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b hover-elevate"
                        data-testid={`row-order-${order.id}`}
                      >
                        <td className="px-2 py-1 text-xs"><PlatformBadge platform={order.platform} /></td>
                        <td className="px-2 py-1 text-xs whitespace-nowrap">{formatDate(order.purchaseDate)}</td>
                        <td className="px-2 py-1">
                          <span className="font-mono text-xs text-muted-foreground">{order.orderId}</span>
                        </td>
                        <td className="px-2 py-1 text-xs">
                          <div className="max-w-[400px] truncate" title={order.productName || ""}>
                            {order.productName || "-"}
                          </div>
                          {order.sku && <div className="text-muted-foreground font-mono">{order.sku}</div>}
                        </td>
                        <td className="px-2 py-1 text-xs text-center">{order.quantity}</td>
                        <td className="px-2 py-1 text-xs">
                          <div>{order.firstName} {order.lastName}</div>
                          {order.phone && <div className="text-muted-foreground">{order.phone}</div>}
                        </td>
                        <td className="px-2 py-1 text-xs">
                          {order.street && <div>{order.street}</div>}
                          {order.contactPerson && <div className="text-muted-foreground">{order.contactPerson}</div>}
                          <div>{order.postalCode} {order.city}</div>
                        </td>
                        <td className="px-2 py-1 text-xs">{order.country}</td>
                        <td className="px-2 py-1 text-xs">
                          <Select
                            value={order.shipper || ""}
                            onValueChange={(value) => updateMutation.mutate({ id: order.id, data: { shipper: value } })}
                          >
                            <SelectTrigger className="h-8 w-[130px] text-xs" data-testid={`select-shipper-${order.id}`}>
                              <SelectValue placeholder="Auswählen" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Senddrop">Senddrop</SelectItem>
                              <SelectItem value="Sendcloud">Sendcloud</SelectItem>
                              <SelectItem value="LogoiX">LogoiX</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1 text-xs">
                          {order.shippingCarrier ? (
                            <div>
                              <div>{order.shippingCarrier}</div>
                              {order.trackingNumber && <div className="text-muted-foreground font-mono truncate max-w-[120px]">{order.trackingNumber}</div>}
                              {order.shippingDate && <div className="text-muted-foreground">{formatDate(order.shippingDate)}</div>}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-2 py-1"><StatusBadge status={order.status} /></td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditOrder(order);
                                setShippingCarrier(order.shippingCarrier || "");
                                setTrackingNumber(order.trackingNumber || "");
                                setShippingDate(order.shippingDate || "");
                              }}
                              data-testid={`button-edit-${order.id}`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteConfirm(order.id)}
                              data-testid={`button-delete-${order.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </Card>

        <div className="flex justify-end pt-2 pb-4">
          <button
            onClick={() => setDeleteAllConfirm(true)}
            className="text-[10px] text-muted-foreground/40 hover:text-destructive/60 transition-colors"
            data-testid="button-delete-all"
          >
            Alle Bestellungen löschen
          </button>
        </div>
      </main>

      <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) setImportResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bestellungen importieren</DialogTitle>
            <DialogDescription>
              Lade eine Amazon (.txt) oder eBay (.csv) Exportdatei hoch. Die Plattform wird automatisch erkannt.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleImport} className="space-y-4">
            <div className="border-2 border-dashed rounded-md p-6 text-center">
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <Input
                type="file"
                name="file"
                accept=".txt,.csv,.tsv"
                className="max-w-xs mx-auto"
                data-testid="input-file-upload"
              />
              <p className="text-xs text-muted-foreground mt-2">TSV (Amazon) oder CSV (eBay) Dateien</p>
            </div>
            {importResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{importResult.imported} Bestellungen importiert</span>
                </div>
                {importResult.duplicates > 0 && (
                  <div className="flex items-start gap-2 text-sm text-amber-600">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{importResult.duplicates} Dubletten übersprungen</span>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setImportOpen(false); setImportResult(null); }}>
                Abbrechen
              </Button>
              <Button type="submit" data-testid="button-submit-import">
                Importieren
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={shippingImportOpen} onOpenChange={(open) => { setShippingImportOpen(open); if (!open) setShippingImportResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Versandliste importieren</DialogTitle>
            <DialogDescription>
              Lade eine Versandliste (.csv) hoch. Versanddienstleister und Paketnummer werden automatisch den bestehenden Bestellungen zugeordnet. Versender wird auf LogoiX gesetzt.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleShippingImport} className="space-y-4">
            <div className="border-2 border-dashed rounded-md p-6 text-center">
              <Truck className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <Input
                type="file"
                name="file"
                accept=".csv"
                className="max-w-xs mx-auto"
                data-testid="input-shipping-file-upload"
              />
              <p className="text-xs text-muted-foreground mt-2">CSV Versandliste mit Referenz und Paketnummer</p>
            </div>
            {shippingImportResult && (
              <div className="space-y-2">
                {shippingImportResult.updated > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>{shippingImportResult.updated} Bestellungen aktualisiert</span>
                  </div>
                )}
                {shippingImportResult.fuzzyMatched?.length > 0 && (
                  <div className="flex items-start gap-2 text-sm text-blue-600">
                    <Search className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <div>Über Name/Telefon/Ort zugeordnet:</div>
                      <ul className="mt-1 text-xs font-mono">
                        {shippingImportResult.fuzzyMatched.map((info) => (
                          <li key={info}>{info}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {shippingImportResult.ambiguous?.length > 0 && (
                  <div className="flex items-start gap-2 text-sm text-amber-600">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <div>{shippingImportResult.ambiguous.length} Referenzen mehrdeutig (mehrere Treffer):</div>
                      <ul className="mt-1 text-xs font-mono">
                        {shippingImportResult.ambiguous.map((ref) => (
                          <li key={ref}>{ref}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {shippingImportResult.notFound.length > 0 && (
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <div>{shippingImportResult.notFound.length} Referenzen nicht gefunden:</div>
                      <ul className="mt-1 text-xs font-mono">
                        {shippingImportResult.notFound.map((ref) => (
                          <li key={ref}>{ref}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShippingImportOpen(false); setShippingImportResult(null); }}>
                Abbrechen
              </Button>
              <Button type="submit" data-testid="button-submit-shipping-import">
                Importieren
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={amazonFetchOpen} onOpenChange={(open) => { if (!open) { setAmazonFetchOpen(false); setAmazonFetchResult(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Amazon Bestellungen abrufen</DialogTitle>
            <DialogDescription>
              Bestellungen werden automatisch über die Amazon SP-API abgerufen und importiert.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Von</label>
                <Input
                  type="date"
                  value={amazonDateFrom}
                  onChange={(e) => setAmazonDateFrom(e.target.value)}
                  data-testid="input-amazon-date-from"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Bis</label>
                <Input
                  type="date"
                  value={amazonDateTo}
                  onChange={(e) => setAmazonDateTo(e.target.value)}
                  data-testid="input-amazon-date-to"
                />
              </div>
            </div>
            {amazonFetching && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                Bestellungen werden abgerufen... Dies kann einen Moment dauern.
              </div>
            )}
            {amazonFetchResult && (
              <div className="space-y-2">
                {amazonFetchResult.imported > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>{amazonFetchResult.imported} Bestellungen importiert</span>
                  </div>
                )}
                {amazonFetchResult.duplicates > 0 && (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{amazonFetchResult.duplicates} Dubletten übersprungen</span>
                  </div>
                )}
                {amazonFetchResult.apiErrors && amazonFetchResult.apiErrors.length > 0 && (
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <div>{amazonFetchResult.apiErrors.length} API-Fehler:</div>
                      <ul className="mt-1 text-xs font-mono">
                        {amazonFetchResult.apiErrors.slice(0, 5).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {amazonFetchResult.apiErrors.length > 5 && (
                          <li>... und {amazonFetchResult.apiErrors.length - 5} weitere</li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAmazonFetchOpen(false); setAmazonFetchResult(null); }}>
              Schließen
            </Button>
            <Button onClick={handleAmazonFetch} disabled={amazonFetching} data-testid="button-submit-amazon-fetch">
              {amazonFetching ? "Abrufen..." : "Bestellungen abrufen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editOrder} onOpenChange={(open) => { if (!open) setEditOrder(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Versanddetails bearbeiten</DialogTitle>
            <DialogDescription>
              Trage Versanddienstleister, Tracking-Nummer und Versanddatum ein. Der Status wird automatisch auf "Versendet" gesetzt.
            </DialogDescription>
          </DialogHeader>
          {editOrder && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <div className="font-medium">{editOrder.firstName} {editOrder.lastName}</div>
                <div className="text-muted-foreground">{editOrder.productName}</div>
                <div className="text-xs text-muted-foreground mt-1">Order: {editOrder.orderId}</div>
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Versanddienstleister</label>
                  <Select value={shippingCarrier} onValueChange={setShippingCarrier}>
                    <SelectTrigger data-testid="select-carrier">
                      <SelectValue placeholder="Auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DHL">DHL</SelectItem>
                      <SelectItem value="DPD">DPD</SelectItem>
                      <SelectItem value="GLS">GLS</SelectItem>
                      <SelectItem value="Hermes">Hermes</SelectItem>
                      <SelectItem value="UPS">UPS</SelectItem>
                      <SelectItem value="FedEx">FedEx</SelectItem>
                      <SelectItem value="Österreichische Post">Österreichische Post</SelectItem>
                      <SelectItem value="Deutsche Post">Deutsche Post</SelectItem>
                      <SelectItem value="Sonstige">Sonstige</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Tracking-Nummer</label>
                  <Input
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="z.B. 1234567890"
                    data-testid="input-tracking"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Versanddatum</label>
                  <Input
                    type="date"
                    value={shippingDate}
                    onChange={(e) => setShippingDate(e.target.value)}
                    data-testid="input-shipping-date"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)}>Abbrechen</Button>
            <Button onClick={handleSaveShipping} disabled={updateMutation.isPending} data-testid="button-save-shipping">
              {updateMutation.isPending ? "Speichern..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bestellung löschen?</DialogTitle>
            <DialogDescription>
              Möchtest du diese Bestellung wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Abbrechen</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteAllConfirm} onOpenChange={setDeleteAllConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alle Bestellungen löschen?</DialogTitle>
            <DialogDescription>
              Möchtest du wirklich ALLE Bestellungen löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAllConfirm(false)}>Abbrechen</Button>
            <Button
              variant="destructive"
              onClick={() => deleteAllMutation.mutate()}
              disabled={deleteAllMutation.isPending}
              data-testid="button-confirm-delete-all"
            >
              {deleteAllMutation.isPending ? "Lösche..." : "Alle löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
