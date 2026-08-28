/**
 * Prodigi Print API v4.0 shapes — only the fields this integration uses. Kept deliberately narrow;
 * these will be reconciled against real sandbox responses the moment the key exists (Phase C), and
 * a prior assumption is not preserved just because it was coded.
 */

/** ORDER shipping methods are PascalCase in the v4.0 reference. */
export type ProdigiShippingMethod = "Budget" | "Standard" | "StandardPlus" | "Express" | "Overnight";

/**
 * QUOTE shipping methods are documented lowercase (`budget`, `standard`, `standardplus`, …) —
 * a genuine casing difference from orders. The client lowercases before sending a quote, so a
 * caller may pass either form. Confirmed against the v4.0 reference; live-quote-confirmed via the
 * sandbox verification script.
 */
export type ProdigiQuoteShippingMethod = "budget" | "standard" | "standardplus" | "express" | "overnight";

export type ProdigiSizing = "fillPrintArea" | "fitPrintArea" | "stretchToPrintArea";

export interface ProdigiVariantResolution {
  printArea: string;
  horizontalResolution: number;
  verticalResolution: number;
}

export interface ProdigiProduct {
  sku: string;
  description?: string;
  productDimensions?: { width: number; height: number; units: string };
  attributes?: Record<string, string[]>;
  variants?: Array<{
    attributes?: Record<string, string>;
    shipsTo?: string[];
    printAreaSizes?: Record<string, { horizontalResolution: number; verticalResolution: number }>;
  }>;
}

export interface ProdigiQuoteItem {
  sku: string;
  copies: number;
  attributes?: Record<string, string>;
  assets: Array<{ printArea: string }>;
}

export interface ProdigiQuoteRequest {
  destinationCountryCode: string;
  currencyCode?: string;
  /** Either case accepted; the client lowercases it (quotes want lowercase per the reference). */
  shippingMethod?: ProdigiQuoteShippingMethod | ProdigiShippingMethod;
  items: ProdigiQuoteItem[];
}

export interface ProdigiCost {
  amount: string;
  currency: string;
}

export interface ProdigiQuoteResponse {
  outcome: string;
  quotes: Array<{
    shipmentMethod: string;
    costSummary: { items: ProdigiCost; shipping: ProdigiCost };
    shipments?: Array<{ fulfillmentLocation?: { countryCode: string; labCode: string } }>;
  }>;
}

export interface ProdigiRecipientAddress {
  line1: string;
  line2?: string;
  postalOrZipCode: string;
  countryCode: string;
  townOrCity: string;
  stateOrCounty?: string;
}

export interface ProdigiRecipient {
  name: string;
  email?: string;
  phoneNumber?: string;
  address: ProdigiRecipientAddress;
}

export interface ProdigiOrderItem {
  sku: string;
  copies: number;
  sizing: ProdigiSizing;
  attributes?: Record<string, string>;
  assets: Array<{ printArea: string; url: string; md5Hash?: string }>;
  merchantReference?: string;
}

export interface ProdigiOrderRequest {
  shippingMethod: ProdigiShippingMethod;
  recipient: ProdigiRecipient;
  items: ProdigiOrderItem[];
  /** BODY field, not a header. Reused verbatim across retries for one internal order. */
  idempotencyKey?: string;
  merchantReference?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export type ProdigiOrderStage = "InProgress" | "Complete" | "Cancelled";

export interface ProdigiShipment {
  id: string;
  /** Processing | Cancelled | Shipped (per the v4.0 shipment status enum). */
  status: string;
  /**
   * Per the v4.0 reference the carrier is an OBJECT ({ name, service }). A union is kept so the
   * extractor tolerates a bare string too — the exact shape is confirmed against a live sandbox
   * order rather than assumed. `extractTracking` normalises either form to a display name.
   */
  carrier?: string | { name?: string; service?: string };
  dispatchDate?: string;
  items?: Array<{ itemId: string }>;
  fulfillmentLocation?: { countryCode: string; labCode: string };
  tracking?: { number?: string; url?: string };
}

export interface ProdigiOrderResponse {
  outcome: string; // created | onHold | createdWithIssues | alreadyExists
  order: {
    id: string;
    created?: string;
    lastUpdated?: string;
    status: {
      stage: ProdigiOrderStage;
      details?: Record<string, string>;
      issues?: Array<{ objectId?: string; errorCode?: string; description?: string }>;
    };
    shipments?: ProdigiShipment[];
    metadata?: Record<string, unknown>;
  };
}
