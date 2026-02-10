import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { parse } from "csv-parse/sync";

const upload = multer({ storage: multer.memoryStorage() });

function detectPlatform(headers: string[]): "Amazon" | "eBay" | "unknown" {
  const headerStr = headers.join(",").toLowerCase();
  if (headerStr.includes("order-item-id") || headerStr.includes("purchase-date") || headerStr.includes("buyer-email")) {
    return "Amazon";
  }
  if (headerStr.includes("ebay") || headerStr.includes("transaction id") || headerStr.includes("buyer username")) {
    return "eBay";
  }
  return "unknown";
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

function parseFile(content: string): Record<string, string>[] {
  const isTabSeparated = content.split("\n")[0].includes("\t");
  const delimiter = isTabSeparated ? "\t" : ",";

  const records = parse(content, {
    delimiter,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  });

  return records;
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
      const firstLine = content.split("\n")[0];
      const isTabSeparated = firstLine.includes("\t");
      const rawHeaders = isTabSeparated
        ? firstLine.split("\t").map(h => h.trim())
        : firstLine.split(",").map(h => h.trim().replace(/^"|"$/g, ""));

      const platform = detectPlatform(rawHeaders);

      let records: Record<string, string>[];
      try {
        records = parseFile(content);
      } catch (parseError) {
        return res.status(400).json({ message: "Datei konnte nicht gelesen werden. Bitte prüfe das Format." });
      }

      if (records.length === 0) {
        return res.status(400).json({ message: "Keine Datensätze in der Datei gefunden" });
      }

      const seenInFile = new Set<string>();
      const orderList: any[] = [];

      for (const r of records) {
        const orderItemId = r["order-item-id"] || r["Transaction ID"] || r["order-id"] || "";
        if (!orderItemId) continue;

        if (seenInFile.has(orderItemId)) continue;
        seenInFile.add(orderItemId);

        const recipientName = r["recipient-name"] || r["Buyer Name"] || r["buyer-name"] || "";
        const { firstName, lastName } = splitName(recipientName);
        const contactPerson = (r["ship-address-2"] || "").trim();
        const customerType = contactPerson ? "Firma" : "Privat";

        orderList.push({
          platform: platform === "unknown" ? "Amazon" : platform,
          purchaseDate: normalizeDate(r["purchase-date"] || r["Sale Date"] || ""),
          orderId: r["order-id"] || r["Order Number"] || "",
          orderItemId,
          email: r["buyer-email"] || r["Buyer Email"] || "",
          phone: r["buyer-phone-number"] || r["Buyer Phone"] || "",
          firstName,
          lastName,
          street: r["ship-address-1"] || r["Shipping Address 1"] || "",
          contactPerson: contactPerson || null,
          city: r["ship-city"] || r["Shipping City"] || "",
          postalCode: r["ship-postal-code"] || r["Shipping Zip"] || "",
          country: r["ship-country"] || r["Shipping Country"] || "",
          sku: r["sku"] || r["Custom Label"] || "",
          productName: r["product-name"] || r["Item Title"] || "",
          quantity: parseInt(r["quantity-purchased"] || r["Quantity"] || "1", 10) || 1,
          customerType,
          shippingCarrier: null,
          trackingNumber: null,
          shippingDate: null,
          status: "Offen",
        });
      }

      const result = await storage.createOrders(orderList);
      res.json(result);
    } catch (error) {
      console.error("Import error:", error);
      res.status(500).json({ message: "Fehler beim Import der Datei" });
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

  return httpServer;
}
