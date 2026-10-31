/**
 * Orbixa Store — Core TypeScript Domain Models (orbixa.ts)
 */

export type Language = 'ar' | 'en';

export type ProductType = 'SUBSCRIPTION' | 'DIGITAL_CODE' | 'MANUAL_SERVICE';

export type RouteView =
  | 'home'
  | 'shop'
  | 'product'
  | 'cart'
  | 'track'
  | 'about'
  | 'contact'
  | 'faq'
  | 'policies'
  | 'login'
  | 'admin';

export interface ProductVariant {
  variant_id: string;
  sku: string;
  name_ar: string;
  name_en: string;
  duration_label_ar: string;
  duration_label_en: string;
  price_ils: number;
  is_available: boolean;
  actual_stock?: number;
  reserved_stock?: number;
  available_stock?: number;
  supplier_cost_ils?: number | null;
  supplier_cost_usdt?: number | null;
}

export interface Product {
  product_id: string;
  sku: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  delivery_info_ar: string;
  delivery_info_en: string;
  category_id: string;
  product_type: ProductType;
  images: string[];
  price_ils: number;
  is_available: boolean;
  is_featured: boolean;
  featured_order: number;
  variants: ProductVariant[];
  created_at?: string;
  actual_stock?: number;
  reserved_stock?: number;
  available_stock?: number;
  supplier_cost_ils?: number | null;
  supplier_cost_usdt?: number | null;
  sales_disabled_due_to_mismatch?: boolean;
  mismatch_reason?: string | null;
  is_archived?: boolean;
  is_active?: boolean;
  sold_count?: number;
  profit_analysis?: {
    cost_status: 'COMPLETE' | 'INCOMPLETE';
    estimated_cost_ils: number | null;
    estimated_profit_ils: number | null;
    low_or_negative_profit_warning: boolean;
    warning_message?: string | null;
  };
}

export interface Category {
  category_id: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  slug: string;
  display_order: number;
  is_active: boolean;
  icon?: string;
}

export interface CartItem {
  product_id: string;
  variant_id?: string | null;
  variant_name_ar?: string;
  variant_name_en?: string;
  sku: string;
  product_type: ProductType;
  name_ar: string;
  name_en: string;
  quantity: number;
  client_unit_price_ils: number;
  image?: string;
}

export interface CartRevalidationLine {
  product_id: string;
  variant_id?: string | null;
  sku?: string;
  name_ar?: string;
  name_en?: string;
  quantity: number;
  is_available?: boolean;
  unit_price_ils: number;
  server_unit_price_ils?: number;
  price_changed: boolean;
  line_total_ils: number;
}

export interface CartRevalidationResponse {
  valid: boolean;
  requires_price_approval: boolean;
  has_price_changes?: boolean;
  has_unavailable_items: boolean;
  server_total_ils: number;
  items: CartRevalidationLine[];
  price_changes?: Array<{
    product_id: string;
    variant_id?: string | null;
    old_price_ils: number;
    new_price_ils: number;
  }>;
  removed_unavailable?: Array<{
    product_id: string;
    variant_id?: string | null;
    reason_en: string;
    reason_ar: string;
  }>;
}

export interface WhatsAppVerification {
  verification_id: string;
  customer_name: string;
  normalized_phone: string;
  display_phone: string;
  verification_code: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejection_reason?: string | null;
  previous_attempt_id?: string | null;
  whatsapp_url: string;
  prefilled_message?: string;
  device_token?: string;
  whatsapp_opened_at?: string | null;
  for_order_number?: string | null;
  created_at?: string;
}

export interface OrderMilestone {
  status: string;
  label_ar: string;
  label_en: string;
  timestamp: string;
}

export interface PublicOrderTracking {
  order_number: string;
  status: string;
  status_label: { ar: string; en: string };
  payment_status: string;
  payment_status_label: { ar: string; en: string };
  payment_method: 'binance_usdt' | 'reflect_ils';
  total_ils: number;
  usdt_payment_snapshot?: {
    required_usdt_amount: number;
    ils_per_usdt_rate: number;
    rate_timestamp: string;
    provider_source?: string;
  } | null;
  created_at: string;
  payment_deadline_at: string;
  cancelled_at?: string | null;
  cancellation_reason?: { ar: string; en: string } | null;
  milestones: OrderMilestone[];
  items_summary: Array<{
    name_ar: string;
    name_en: string;
    quantity: number;
    line_total_ils: number;
  }>;
  support_whatsapp_url: string;
}

export interface CmsSectionConfig {
  id: string;
  type: 'hero' | 'categories' | 'featured' | 'promo';
  enabled: boolean;
  order: number;
  title_en?: string;
  title_ar?: string;
}

export interface StorefrontCms {
  homepage: {
    en: {
      headline: string;
      supporting_headline: string;
      description: string;
      primary_cta: string;
      tagline: string;
      promo_banner_title: string;
      promo_banner_subtitle: string;
    };
    ar: {
      headline: string;
      supporting_headline: string;
      description: string;
      primary_cta: string;
      tagline: string;
      promo_banner_title: string;
      promo_banner_subtitle: string;
    };
    sections: CmsSectionConfig[];
  };
  about: {
    en: { title: string; content: string };
    ar: { title: string; content: string };
  };
  contact: {
    en: { title: string; subtitle: string; working_hours: string };
    ar: { title: string; subtitle: string; working_hours: string };
  };
  faq: {
    en: Array<{ q: string; a: string }>;
    ar: Array<{ q: string; a: string }>;
  };
  policies: {
    en: { title: string; terms: string; non_refund_policy: string; privacy_policy: string };
    ar: { title: string; terms: string; non_refund_policy: string; privacy_policy: string };
  };
}

export interface PublicStoreSettings {
  store_whatsapp_number: string;
  payment_methods: {
    binance_usdt: {
      enabled: boolean;
      pay_id: string;
      wallet_address: string;
      network: string;
      instructions_en: string;
      instructions_ar: string;
      image_url: string;
    };
    reflect_ils: {
      enabled: boolean;
      identifier: string;
      instructions_en: string;
      instructions_ar: string;
      image_url: string;
    };
  };
  social_links: Record<string, string>;
  maintenance_mode: {
    enabled: boolean;
    message_en?: string;
    message_ar?: string;
  };
}
