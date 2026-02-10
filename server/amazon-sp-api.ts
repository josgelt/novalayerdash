const SP_API_EU_ENDPOINT = "https://sellingpartnerapi-eu.amazon.com";
const LWA_TOKEN_ENDPOINT = "https://api.amazon.com/auth/o2/token";
const MARKETPLACE_DE = "A1PA6795UKMFR9";

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: process.env.AMAZON_SP_REFRESH_TOKEN || "",
    client_id: process.env.AMAZON_SP_CLIENT_ID || "",
    client_secret: process.env.AMAZON_SP_CLIENT_SECRET || "",
  });

  const res = await fetch(LWA_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LWA Token-Fehler: ${res.status} ${err}`);
  }

  const data = await res.json();
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedAccessToken!;
}

async function getRestrictedDataToken(accessToken: string, path: string): Promise<string> {
  const res = await fetch(`${SP_API_EU_ENDPOINT}/tokens/2021-03-01/restrictedDataToken`, {
    method: "POST",
    headers: {
      "x-amz-access-token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      restrictedResources: [
        {
          method: "GET",
          path,
          dataElements: ["buyerInfo", "shippingAddress"],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.warn("RDT request failed:", res.status, err);
    throw new Error(`RDT-Fehler (${res.status}): Kein Zugriff auf Adressdaten. Prüfe die App-Berechtigungen.`);
  }

  const data = await res.json();
  if (!data.restrictedDataToken) {
    throw new Error("RDT-Antwort enthält kein Token");
  }
  return data.restrictedDataToken;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      const waitTime = Math.pow(2, attempt) * 2000;
      console.warn(`Rate limited (429), waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
      await sleep(waitTime);
      continue;
    }
    return res;
  }
  throw new Error("Rate limit: Zu viele Anfragen an die Amazon API. Bitte später erneut versuchen.");
}

interface AmazonOrder {
  AmazonOrderId: string;
  PurchaseDate: string;
  OrderStatus: string;
  BuyerInfo?: {
    BuyerEmail?: string;
    BuyerName?: string;
  };
  ShippingAddress?: {
    Name?: string;
    AddressLine1?: string;
    AddressLine2?: string;
    City?: string;
    StateOrRegion?: string;
    PostalCode?: string;
    CountryCode?: string;
    Phone?: string;
  };
}

interface AmazonOrderItem {
  OrderItemId: string;
  SellerSKU?: string;
  Title?: string;
  QuantityOrdered: number;
  ItemPrice?: { Amount?: string; CurrencyCode?: string };
  ItemTax?: { Amount?: string };
  ShippingPrice?: { Amount?: string };
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0 || (parts.length === 1 && !parts[0])) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  const lastName = parts.pop() || "";
  return { firstName: parts.join(" "), lastName };
}

function mapOrderToSchema(order: AmazonOrder, item: AmazonOrderItem) {
  const addr = order.ShippingAddress || {};
  const recipientName = addr.Name || order.BuyerInfo?.BuyerName || "";
  const { firstName, lastName } = splitName(recipientName);

  const contactPerson = (addr.AddressLine2 || "").trim();
  const customerType = contactPerson ? "Firma" : "Privat";

  return {
    platform: "Amazon" as const,
    purchaseDate: order.PurchaseDate || "",
    orderId: order.AmazonOrderId || "",
    orderItemId: item.OrderItemId || order.AmazonOrderId || "",
    email: order.BuyerInfo?.BuyerEmail || "",
    phone: addr.Phone || "",
    firstName,
    lastName,
    street: addr.AddressLine1 || "",
    contactPerson: contactPerson || null,
    city: addr.City || "",
    postalCode: addr.PostalCode || "",
    country: addr.CountryCode || "",
    sku: item.SellerSKU || "",
    productName: item.Title || "",
    quantity: item.QuantityOrdered || 1,
    price: item.ItemPrice?.Amount || null,
    shippingCost: item.ShippingPrice?.Amount || null,
    customerType,
    shippingCarrier: null,
    trackingNumber: null,
    shippingDate: null,
    status: "Offen",
  };
}

export async function fetchAmazonOrders(createdAfter: string, createdBefore?: string): Promise<{
  orders: ReturnType<typeof mapOrderToSchema>[];
  errors: string[];
}> {
  const errors: string[] = [];
  const allMappedOrders: ReturnType<typeof mapOrderToSchema>[] = [];

  const accessToken = await getAccessToken();

  let rdtToken: string;
  try {
    rdtToken = await getRestrictedDataToken(accessToken, "/orders/v0/orders");
  } catch (rdtErr: any) {
    console.warn("RDT für Orders fehlgeschlagen, fahre ohne PII-Zugriff fort:", rdtErr.message);
    errors.push("Adressdaten nicht verfügbar (RDT fehlgeschlagen) - Bestellungen werden ohne Adresse importiert");
    rdtToken = accessToken;
  }

  let nextToken: string | null = null;
  let allOrders: AmazonOrder[] = [];

  do {
    const params = new URLSearchParams({
      MarketplaceIds: MARKETPLACE_DE,
      CreatedAfter: createdAfter,
      MaxResultsPerPage: "50",
    });

    if (createdBefore) params.set("CreatedBefore", createdBefore);
    if (nextToken) params.set("NextToken", nextToken);

    const url = `${SP_API_EU_ENDPOINT}/orders/v0/orders?${params.toString()}`;

    const res = await fetchWithRetry(url, {
      headers: {
        "x-amz-access-token": rdtToken,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Orders API Fehler: ${res.status} ${errText}`);
    }

    const data = await res.json();
    const orderList = data.payload?.Orders || [];
    allOrders = allOrders.concat(orderList);

    nextToken = data.payload?.NextToken || null;

    if (nextToken) {
      await sleep(2000);
    }
  } while (nextToken);

  for (const order of allOrders) {
    if (order.OrderStatus === "Canceled") continue;

    try {
      await sleep(500);

      let itemRdt: string;
      try {
        itemRdt = await getRestrictedDataToken(accessToken, `/orders/v0/orders/${order.AmazonOrderId}/items`);
      } catch {
        itemRdt = accessToken;
      }

      const itemUrl = `${SP_API_EU_ENDPOINT}/orders/v0/orders/${order.AmazonOrderId}/items`;
      const itemRes = await fetchWithRetry(itemUrl, {
        headers: {
          "x-amz-access-token": itemRdt,
          "Content-Type": "application/json",
        },
      });

      if (!itemRes.ok) {
        const errText = await itemRes.text();
        errors.push(`Items für ${order.AmazonOrderId}: ${itemRes.status}`);
        console.warn(`getOrderItems error for ${order.AmazonOrderId}:`, errText);
        continue;
      }

      const itemData = await itemRes.json();
      const items: AmazonOrderItem[] = itemData.payload?.OrderItems || [];

      for (const item of items) {
        const mapped = mapOrderToSchema(order, item);
        if (mapped.orderItemId) {
          allMappedOrders.push(mapped);
        }
      }
    } catch (err: any) {
      errors.push(`${order.AmazonOrderId}: ${err.message}`);
    }
  }

  return { orders: allMappedOrders, errors };
}
