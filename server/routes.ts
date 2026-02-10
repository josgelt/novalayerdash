import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { parse } from "csv-parse/sync";

const upload = multer({ storage: multer.memoryStorage() });

function detectDelimiter(firstLine: string): string {
  if (firstLine.includes("\t")) return "\t";
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function detectPlatform(headers: string[]): "Amazon" | "eBay" {
  const headerStr = headers.join("|").toLowerCase();
  if (headerStr.includes("order-item-id") || headerStr.includes("purchase-date") || headerStr.includes("buyer-email")) {
    return "Amazon";
  }
  if (
    headerStr.includes("bestellnummer") ||
    headerStr.includes("verkaufsprotokollnummer") ||
    headerStr.includes("käufer") ||
    headerStr.includes("empfänger") ||
    headerStr.includes("angebotstitel") ||
    headerStr.includes("artikelnummer")
  ) {
    return "eBay";
  }
  return "Amazon";
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0 || (parts.length === 1 && !parts[0])) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  const lastName = parts.pop() || "";
  return { firstName: parts.join(" "), lastName };
}

function normalizeDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toISOString();
  } catch {
    return dateStr;
  }
}

function parseEbayDate(dateStr: string): string {
  if (!dateStr) return "";
  const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z`;
  }
  const match2 = dateStr.match(/(\w+)-(\d{2})-(\d{4})/i);
  if (match2) {
    const months: Record<string, string> = {
      "Jan": "01", "Feb": "02", "Mär": "03", "Mar": "03", "Apr": "04",
      "Mai": "05", "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
      "Sep": "09", "Okt": "10", "Oct": "10", "Nov": "11", "Dez": "12", "Dec": "12"
    };
    const month = months[match2[1]] || "01";
    return `${match2[3]}-${month}-${match2[2]}T00:00:00.000Z`;
  }
  return normalizeDate(dateStr);
}

function parsePrice(priceStr: string): string {
  if (!priceStr) return "";
  const cleaned = priceStr
    .replace(/[€$£\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return priceStr;
  return num.toFixed(2);
}

function parseFile(content: string): { records: Record<string, string>[]; delimiter: string } {
  const lines = content.split("\n");
  let headerLineIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i].trim();
    if (line && !line.match(/^[;,\t\s"]*$/)) {
      headerLineIndex = i;
      break;
    }
  }

  const headerLine = lines[headerLineIndex];
  const delimiter = detectDelimiter(headerLine);

  const contentToProcess = lines.slice(headerLineIndex).join("\n");

  const records = parse(contentToProcess, {
    delimiter,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
    quote: '"',
  }) as Record<string, string>[];

  const filtered = records.filter(r => {
    const values = Object.values(r);
    const nonEmpty = values.filter(v => v && v.trim());
    return nonEmpty.length > 3;
  });

  return { records: filtered, delimiter };
}

function mapAmazonRecord(r: Record<string, string>): any {
  const recipientName = r["recipient-name"] || r["buyer-name"] || "";
  const { firstName, lastName } = splitName(recipientName);
  const contactPerson = (r["ship-address-2"] || "").trim();
  const customerType = contactPerson ? "Firma" : "Privat";

  return {
    platform: "Amazon",
    purchaseDate: normalizeDate(r["purchase-date"] || ""),
    orderId: r["order-id"] || "",
    orderItemId: r["order-item-id"] || r["order-id"] || "",
    email: r["buyer-email"] || "",
    phone: r["buyer-phone-number"] || "",
    firstName,
    lastName,
    street: r["ship-address-1"] || "",
    contactPerson: contactPerson || null,
    city: r["ship-city"] || "",
    postalCode: r["ship-postal-code"] || "",
    country: r["ship-country"] || "",
    sku: r["sku"] || "",
    productName: r["product-name"] || "",
    quantity: parseInt(r["quantity-purchased"] || "1", 10) || 1,
    price: parsePrice(r["item-price"] || r["price"] || "") || null,
    shippingCost: parsePrice(r["shipping-price"] || r["shipping-fee"] || "") || null,
    customerType,
    shippingCarrier: null,
    trackingNumber: null,
    shippingDate: null,
    status: "Offen",
  };
}

function mapEbayRecord(r: Record<string, string>): any {
  const recipientName = r["Name des Empfängers"] || r["Name des Käufers"] || "";
  const { firstName, lastName } = splitName(recipientName);

  const shippingAddress2 = (r["Adresse 2 des Empfängers"] || "").trim();
  const buyerAddress2 = (r["Adresse 2 des Käufers"] || "").trim();
  const contactPerson = shippingAddress2 || buyerAddress2 || "";
  const customerType = contactPerson ? "Firma" : "Privat";

  const orderId = r["Bestellnummer"] || "";
  const salesRecordId = r["Verkaufsprotokollnummer"] || "";
  const transactionId = r["Transaktionsnummer"] || "";
  const lineItemId = salesRecordId || transactionId || orderId;
  const orderItemId = lineItemId ? `ebay-${lineItemId}` : "";

  const purchaseDateRaw = r["Verkauft am"] || r["Zahlungsdatum"] || "";
  const purchaseDate = parseEbayDate(purchaseDateRaw);

  return {
    platform: "eBay",
    purchaseDate,
    orderId,
    orderItemId,
    email: r["E-Mail des Käufers"] || "",
    phone: r["Telefonnummer des Empfängers"] || "",
    firstName,
    lastName,
    street: r["Adresse 1 des Empfängers"] || r["Adresse 1 des Käufers"] || "",
    contactPerson: contactPerson || null,
    city: r["Versand nach - Ort"] || r["Wohnort des Käufers"] || "",
    postalCode: r["Versand nach - PLZ"] || r["PLZ des Käufers"] || "",
    country: r["Versand nach - Land"] || r["Land des Käufers"] || "",
    sku: r["Bestandseinheit"] || "",
    productName: r["Angebotstitel"] || "",
    quantity: parseInt(r["Anzahl"] || r["Menge"] || "1", 10) || 1,
    price: parsePrice(r["Verkauft für"] || r["Gesamtbetrag"] || "") || null,
    shippingCost: parsePrice(r["Verpackung und Versand"] || "") || null,
    customerType,
    shippingCarrier: r["Versandservice"] || null,
    trackingNumber: r["Sendungsnummer"] || null,
    shippingDate: null,
    status: "Offen",
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/orders", async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        country: req.query.country as string | undefined,
        platform: req.query.platform as string | undefined,
      };
      const orders = await storage.getOrders(filters);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Fehler beim Laden der Bestellungen" });
    }
  });

  app.post("/api/orders/import", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Keine Datei hochgeladen" });
      }

      const content = req.file.buffer.toString("utf-8");
      
      let parsed: { records: Record<string, string>[]; delimiter: string };
      try {
        parsed = parseFile(content);
      } catch (parseError) {
        return res.status(400).json({ message: "Datei konnte nicht gelesen werden. Bitte prüfe das Format." });
      }

      const { records } = parsed;

      if (records.length === 0) {
        return res.status(400).json({ message: "Keine Datensätze in der Datei gefunden" });
      }

      const firstRecordKeys = Object.keys(records[0]);
      const platform = detectPlatform(firstRecordKeys);

      const seenInFile = new Set<string>();
      const orderList: any[] = [];

      for (const r of records) {
        const mapped = platform === "eBay" ? mapEbayRecord(r) : mapAmazonRecord(r);
        
        if (!mapped.orderItemId || mapped.orderItemId === "ebay-") continue;

        if (seenInFile.has(mapped.orderItemId)) continue;
        seenInFile.add(mapped.orderItemId);

        orderList.push(mapped);
      }

      const result = await storage.createOrders(orderList);
      res.json(result);
    } catch (error) {
      console.error("Import error:", error);
      res.status(500).json({ message: "Fehler beim Import der Datei" });
    }
  });

  app.post("/api/orders/import-shipping", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Keine Datei hochgeladen" });
      }

      let content = req.file.buffer.toString("utf-8");
      content = content.replace(/="/g, '"');

      let parsed: { records: Record<string, string>[]; delimiter: string };
      try {
        parsed = parseFile(content);
      } catch (parseError) {
        return res.status(400).json({ message: "Datei konnte nicht gelesen werden. Bitte prüfe das Format." });
      }

      const { records } = parsed;

      if (records.length === 0) {
        return res.status(400).json({ message: "Keine Datensätze in der Datei gefunden" });
      }

      let updated = 0;
      const notFound: string[] = [];
      const fuzzyMatched: string[] = [];
      const ambiguous: string[] = [];
      const today = new Date().toISOString().split("T")[0];

      const allOrders = await storage.getAllOrders();

      for (const r of records) {
        const referenz = (r["Referenz"] || "").trim();
        if (!referenz) continue;

        const trackingNum = (r["Paketnummer Lieferant"] || "").trim();
        const carrier = (r["Lieferant"] || "").trim();
        const csvName = (r["Name"] || "").trim().toLowerCase();
        const csvPhone = (r["Tel"] || "").trim().replace(/[\s\-\+]/g, "");
        const csvOrt = (r["Ort"] || "").trim().toLowerCase();

        let matchingOrders = await storage.getOrdersByOrderId(referenz);

        if (matchingOrders.length === 0 && (csvName || csvPhone)) {
          const candidates = allOrders.filter((o) => {
            const fullName = `${o.firstName} ${o.lastName}`.toLowerCase();
            const orderPhone = (o.phone || "").replace(/[\s\-\+]/g, "");
            const orderCity = (o.city || "").toLowerCase();

            const nameMatch = csvName && fullName === csvName;
            const phoneMatch = csvPhone && orderPhone && orderPhone.endsWith(csvPhone.slice(-6)) && csvPhone.slice(-6).length >= 6;
            const cityMatch = csvOrt && orderCity === csvOrt;

            if (nameMatch && phoneMatch) return true;
            if (nameMatch && cityMatch) return true;
            if (phoneMatch && cityMatch) return true;
            return false;
          });

          if (candidates.length === 1) {
            matchingOrders = candidates;
            fuzzyMatched.push(`${referenz} → ${candidates[0].orderId} (${candidates[0].firstName} ${candidates[0].lastName})`);
          } else if (candidates.length > 1) {
            ambiguous.push(referenz);
            continue;
          }
        }

        if (matchingOrders.length === 0) {
          notFound.push(referenz);
          continue;
        }

        for (const order of matchingOrders) {
          await storage.updateOrder(order.id, {
            shippingCarrier: carrier || null,
            trackingNumber: trackingNum || null,
            shippingDate: today,
            shipper: "LogoiX",
          });
          updated++;
        }
      }

      res.json({ updated, notFound, fuzzyMatched, ambiguous });
    } catch (error) {
      console.error("Shipping import error:", error);
      res.status(500).json({ message: "Fehler beim Import der Versandliste" });
    }
  });

  app.patch("/api/orders/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const updated = await storage.updateOrder(id, req.body);
      if (!updated) {
        return res.status(404).json({ message: "Bestellung nicht gefunden" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Fehler beim Aktualisieren" });
    }
  });

  app.delete("/api/orders/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      await storage.deleteOrder(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Fehler beim Löschen" });
    }
  });

  app.delete("/api/orders", async (req, res) => {
    try {
      const count = await storage.deleteAllOrders();
      res.json({ success: true, deleted: count });
    } catch (error) {
      res.status(500).json({ message: "Fehler beim Löschen aller Bestellungen" });
    }
  });

  return httpServer;
}
