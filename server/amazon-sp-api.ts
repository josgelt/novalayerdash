const SP_API_EU_ENDPOINT = "https://sellingpartnerapi-eu.amazon.com";
const LWA_TOKEN_ENDPOINT = "https://api.amazon.com/auth/o2/token";
const MARKETPLACE_DE = "A1PA6795UKMFR9";
const USER_AGENT = "NovalayerOrderDashboard/1.0 (Language=TypeScript)";

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

function invalidateAccessToken() {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  invalidateAccessToken();

  const refreshToken = process.env.AMAZON_SP_REFRESH_TOKEN || "";
  const clientId = process.env.AMAZON_SP_CLIENT_ID || "";
  const clientSecret = process.env.AMAZON_SP_CLIENT_SECRET || "";

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Amazon API Zugangsdaten fehlen. Bitte AMAZON_SP_CLIENT_ID, AMAZON_SP_CLIENT_SECRET und AMAZON_SP_REFRESH_TOKEN in den Secrets konfigurieren.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(LWA_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Amazon Login-Fehler (${res.status}): Zugangsdaten ungültig. Bitte Client ID, Client Secret und Refresh Token prüfen.`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("Amazon Login hat kein Access Token zurückgegeben.");
  }
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  const tokenPrefix = (data.access_token as string).substring(0, 10);
  console.log(`LWA Access Token erneuert (${tokenPrefix}...), gültig für ${data.expires_in}s, Client: ${clientId.substring(0, 15)}...`);
  return cachedAccessToken!;
}

async function getRestrictedDataToken(accessToken: string, path: string): Promise<string> {
  const res = await fetch(`${SP_API_EU_ENDPOINT}/tokens/2021-03-01/restrictedDataToken`, {
    method: "POST",
    headers: {
      "x-amz-access-token": accessToken,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
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
    throw new Error(`RDT-Fehler (${res.status})`);
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

function spApiHeaders(token: string): Record<string, string> {
  return {
    "x-amz-access-token": token,
    "User-Agent": USER_AGENT,
  };
}

async function callOrdersApi(token: string, params: URLSearchParams): Promise<Response> {
  const url = `${SP_API_EU_ENDPOINT}/orders/v0/orders?${params.toString()}`;
  console.log("Calling Orders API...", url.substring(0, 80));
  const res = await fetchWithRetry(url, {
    headers: spApiHeaders(token),
  });

  if (res.status === 403) {
    console.warn("Orders API returned 403, forcing token refresh and retrying...");
    const freshToken = await getAccessToken(true);
    return await fetchWithRetry(url, {
      headers: spApiHeaders(freshToken),
    });
  }

  return res;
}

export async function fetchAmazonOrders(createdAfter: string, createdBefore?: string): Promise<{
  orders: ReturnType<typeof mapOrderToSchema>[];
  errors: string[];
}> {
  const errors: string[] = [];
  const allMappedOrders: ReturnType<typeof mapOrderToSchema>[] = [];

  let accessToken = await getAccessToken();

  let useRdt = true;
  let rdtToken: string;
  try {
    rdtToken = await getRestrictedDataToken(accessToken, "/orders/v0/orders");
  } catch (rdtErr: any) {
    console.warn("RDT für Orders fehlgeschlagen, fahre ohne PII-Zugriff fort:", rdtErr.message);
    useRdt = false;
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

    const res = await callOrdersApi(rdtToken, params);

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 403) {
        throw new Error(
          "Zugriff verweigert (403). Mögliche Ursachen:\n" +
          "1. Der Refresh Token ist abgelaufen oder ungültig\n" +
          "2. Die App hat keine Berechtigung für die Orders API\n" +
          "3. Die IAM-Rolle ist nicht korrekt konfiguriert\n" +
          "Bitte prüfe die Amazon Seller Central Developer-Einstellungen."
        );
      }
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

  if (!useRdt && allOrders.length > 0) {
    errors.push("Adressdaten nicht verfügbar (RDT fehlgeschlagen) - Bestellungen werden ohne Adresse importiert");
  }

  accessToken = await getAccessToken();

  for (const order of allOrders) {
    if (order.OrderStatus === "Canceled") continue;

    try {
      await sleep(500);

      let itemToken: string;
      try {
        itemToken = await getRestrictedDataToken(accessToken, `/orders/v0/orders/${order.AmazonOrderId}/items`);
      } catch {
        itemToken = accessToken;
      }

      const itemUrl = `${SP_API_EU_ENDPOINT}/orders/v0/orders/${order.AmazonOrderId}/items`;
      let itemRes = await fetchWithRetry(itemUrl, {
        headers: spApiHeaders(itemToken),
      });

      if (itemRes.status === 403 && itemToken !== accessToken) {
        itemRes = await fetchWithRetry(itemUrl, {
          headers: spApiHeaders(accessToken),
        });
      }

      if (!itemRes.ok) {
        errors.push(`Items für ${order.AmazonOrderId}: ${itemRes.status}`);
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
