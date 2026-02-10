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
import { Upload, Package, Truck, Calendar, Globe, Filter, Trash2, Edit3, X, Check, Search, FileText, AlertTriangle } from "lucide-react";
import logoPath from "@assets/5285709155_1770718268325.png";
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

  const [shippingCarrier, setShippingCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shippingDate, setShippingDate] = useState("");

  const [importResult, setImportResult] = useState<{ imported: number; duplicates: number; duplicateIds: string[] } | null>(null);

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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight" data-testid="text-header-title">Novalayer Order Dashboard</h1>
          </div>
          <img src={logoPath} alt="Novalayer Logo" className="h-8 object-contain" data-testid="img-logo" />
        </div>
      </header>

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
            <div className="ml-auto">
              <Button onClick={() => setImportOpen(true)} data-testid="button-import">
                <Upload className="w-4 h-4 mr-2" />
                Importieren
              </Button>
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
                <table className="w-full text-sm" data-testid="table-orders">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-3 font-medium text-muted-foreground">Plattform</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Bestelldatum</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Order ID</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Kunde</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Adresse</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Artikel</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Menge</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Typ</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Versender</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Versand</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b hover-elevate"
                        data-testid={`row-order-${order.id}`}
                      >
                        <td className="p-3"><PlatformBadge platform={order.platform} /></td>
                        <td className="p-3 whitespace-nowrap">{formatDate(order.purchaseDate)}</td>
                        <td className="p-3">
                          <span className="font-mono text-xs text-muted-foreground">{order.orderId}</span>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{order.firstName} {order.lastName}</div>
                          {order.email && <div className="text-xs text-muted-foreground truncate max-w-[180px]">{order.email}</div>}
                          {order.phone && <div className="text-xs text-muted-foreground">{order.phone}</div>}
                        </td>
                        <td className="p-3">
                          <div className="text-xs">
                            {order.street && <div>{order.street}</div>}
                            {order.contactPerson && <div className="text-muted-foreground">{order.contactPerson}</div>}
                            <div>{order.postalCode} {order.city}</div>
                            <div className="text-muted-foreground">{order.country}</div>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="max-w-[200px] truncate" title={order.productName || ""}>
                            {order.productName || "-"}
                          </div>
                          {order.sku && <div className="text-xs text-muted-foreground font-mono">{order.sku}</div>}
                        </td>
                        <td className="p-3 text-center">{order.quantity}</td>
                        <td className="p-3">
                          <Badge variant={order.customerType === "Firma" ? "default" : "secondary"} className={order.customerType === "Firma" ? "bg-blue-600 text-white" : ""}>
                            {order.customerType}
                          </Badge>
                        </td>
                        <td className="p-3">
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
                        <td className="p-3">
                          {order.shippingCarrier ? (
                            <div className="text-xs">
                              <div className="font-medium">{order.shippingCarrier}</div>
                              {order.trackingNumber && <div className="text-muted-foreground font-mono truncate max-w-[120px]">{order.trackingNumber}</div>}
                              {order.shippingDate && <div className="text-muted-foreground">{formatDate(order.shippingDate)}</div>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-3"><StatusBadge status={order.status} /></td>
                        <td className="p-3">
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
    </div>
  );
}
