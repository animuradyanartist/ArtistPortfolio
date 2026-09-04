/**
 * Server-side entry point for the canonical, sandbox-verified Prodigi launch products. The DATA
 * lives in shared/ (pure, no secret) so the eligibility engine, the storefront, the feed and the
 * checkout all judge a variant against the same verified facts; this re-export is the import path
 * server code (checkout, admin, fulfilment) uses.
 */
export {
  PRODIGI_LAUNCH_PRODUCTS,
  getProdigiProduct,
  isActiveLaunchSku,
  activeLaunchSkus,
  productsForMaterial,
  offeredProductsForMaterial,
  isSkuOfferedForNewVariant,
  eligibleSkusForMaster,
  assessMasterForSku,
  maxCropEffectiveDpiForSku,
  printableSkusForMaster,
  classifyMasterResolution,
  skuAspect,
  MATERIAL_LABEL,
  DEFAULT_SKU_POLICY,
  DEFAULT_CANVAS_WRAP,
  requiredAttributesForSku,
  defaultAttributesForMaterial,
  type ProdigiLaunchProduct,
  type PrintMaterial,
  type SkuEligibility,
  type SkuEligibilityPolicy,
  type MasterResolutionKind,
} from "@shared/commerce/prodigiProducts";
