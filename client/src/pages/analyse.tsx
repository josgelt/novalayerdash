import { useQuery } from "@tanstack/react-query";
import type { Order } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";

interface ArticleRow {
  sku: string;
  productName: string;
  countryCounts: Record<string, number>;
  total: number;
}

function buildAnalysisData(orders: Order[]): { rows: ArticleRow[]; countries: string[] } {
  const shipped = orders.filter(o => o.status === "Versendet");

  const countrySet = new Set<string>();
  const articleMap = new Map<string, ArticleRow>();

  for (const o of shipped) {
    const sku = o.sku || "-";
    const productName = o.productName || "-";
    const country = o.country || "Unbekannt";
    const qty = o.quantity || 1;

    countrySet.add(country);

    const key = sku;
    let row = articleMap.get(key);
    if (!row) {
      row = { sku, productName, countryCounts: {}, total: 0 };
      articleMap.set(key, row);
    }

    if (productName !== "-" && (country === "DE" || country === "AT" || row.productName === "-")) {
      row.productName = productName;
    }

    row.countryCounts[country] = (row.countryCounts[country] || 0) + qty;
    row.total += qty;
  }

  const countries = Array.from(countrySet).sort();
  const rows = Array.from(articleMap.values()).sort((a, b) => b.total - a.total);

  return { rows, countries };
}

export default function Analyse() {
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    queryFn: async () => {
      const res = await fetch("/api/orders", { credentials: "include" });
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json();
    },
  });

  const { rows, countries } = buildAnalysisData(orders);

  const countryTotals: Record<string, number> = {};
  let grandTotal = 0;
  for (const row of rows) {
    for (const c of countries) {
      countryTotals[c] = (countryTotals[c] || 0) + (row.countryCounts[c] || 0);
    }
    grandTotal += row.total;
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-[1600px] mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-3">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold" data-testid="text-analyse-title">Versandanalyse nach Artikel und Land</h2>
      </div>

      {rows.length === 0 ? (
        <Card className="p-8">
          <p className="text-center text-muted-foreground" data-testid="text-no-data">Keine versendeten Bestellungen vorhanden</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-analyse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-muted/50">ArtNr</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Artikel</th>
                  {countries.map(c => (
                    <th key={c} className="text-center p-3 font-medium text-muted-foreground min-w-[60px]" data-testid={`header-country-${c}`}>{c}</th>
                  ))}
                  <th className="text-center p-3 font-semibold text-foreground min-w-[70px]">Summe</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.sku + idx} className="border-b last:border-b-0" data-testid={`row-article-${idx}`}>
                    <td className="p-3 font-mono text-xs sticky left-0 bg-background">{row.sku}</td>
                    <td className="p-3 max-w-[300px] truncate" title={row.productName}>{row.productName}</td>
                    {countries.map(c => (
                      <td key={c} className="text-center p-3 tabular-nums">
                        {row.countryCounts[c] || <span className="text-muted-foreground/40">-</span>}
                      </td>
                    ))}
                    <td className="text-center p-3 font-semibold tabular-nums">{row.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/30">
                  <td className="p-3 font-semibold sticky left-0 bg-muted/30" colSpan={2}>Gesamt</td>
                  {countries.map(c => (
                    <td key={c} className="text-center p-3 font-semibold tabular-nums">{countryTotals[c] || 0}</td>
                  ))}
                  <td className="text-center p-3 font-bold tabular-nums">{grandTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
