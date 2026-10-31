/**
 * Orbixa Store — Complete Full-Stack React/TypeScript Frontend Application (App.tsx)
 * ----------------------------------------------------------------------------------
 * Connects all public storefront views and protected admin management screens directly
 * to the Flask REST API (`/api/v1/*`):
 * - Home (dynamic ordered CMS sections, localized hero banner, categories, featured products, promo)
 * - Shop (search, category filters, sorting, loading/error/empty states, pagination)
 * - Product Detail & Variant Selection (dynamic price/SKU/availability per variant, delivery info)
 * - Cart & Checkout (quantity editing, item removal, server cart revalidation, explicit price-change
 *   approval, mandatory guest WhatsApp verification, Reflect ILS & Binance USDT selection, idempotent order creation)
 * - Order Confirmation, Payment Instructions & Private Order Tracking (20-minute countdown, Reflect/Binance
 *   payment report submission, copy order number, post-order WhatsApp change request, milestones)
 * - About, Contact, FAQ, and Policies (driven by live published bilingual CMS)
 * - Admin Login & Protected Admin Dashboard (Overview & Safe Mode/Backups, `تأكيد أرقام واتساب`,
 *   Orders & Manual Payment Review & Complete Fulfillment, `الطلبات المنتظرة`, Products/Categories &
 *   Inventory Reconciliation Audit & CSV Import/Export, Task Center & Support Follow-Ups, Bilingual CMS
 *   Draft/Preview/Publish & WhatsApp Templates & Store Settings, Financial/Operational Reports & Audit/Error Logs)
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Language,
  RouteView,
  CmsSectionConfig,
  Product,
  ProductVariant,
  Category,
  CartItem,
  CartRevalidationResponse,
  WhatsAppVerification,
  PublicOrderTracking,
  StorefrontCms,
  PublicStoreSettings,
} from './types/orbixa';
import {
  detectInitialLanguage,
  persistLanguageChoice,
  UI_STRINGS,
  formatCurrencyILS,
  formatCurrencyUSDT,
} from './i18n/translations';
import { apiRequest, setCsrfToken } from './api/client';

function generateIdempotencyKey(): string {
  return `orb_idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function initialRouteFromLocation(): { route: RouteView; token?: string; productId?: string } {
  if (typeof window === 'undefined') return { route: 'home' };
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/shop') return { route: 'shop' };
  if (path.startsWith('/product/')) return { route: 'product', productId: path.split('/product/')[1] };
  if (path === '/cart' || path === '/checkout') return { route: 'cart' };
  if (path.startsWith('/track/')) return { route: 'track', token: path.split('/track/')[1] };
  if (path === '/track') return { route: 'track' };
  if (path === '/about') return { route: 'about' };
  if (path === '/contact') return { route: 'contact' };
  if (path === '/faq') return { route: 'faq' };
  if (path === '/policies') return { route: 'policies' };
  if (path === '/login') return { route: 'login' };
  if (path === '/admin') return { route: 'admin' };
  return { route: 'home' };
}

export default function App() {
  const initLoc = initialRouteFromLocation();
  const [lang, setLang] = useState<Language>(() => detectInitialLanguage());
  const [route, setRoute] = useState<RouteView>(initLoc.route);

  // Storefront initialization state
  const [cms, setCms] = useState<StorefrontCms | null>(null);
  const [storeSettings, setStoreSettings] = useState<PublicStoreSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [usdtRateInfo, setUsdtRateInfo] = useState<{
    ils_per_usdt_rate: number;
    rate_timestamp: string;
    provider_source: string;
  } | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState<{
    enabled: boolean;
    message_ar: string;
    message_en: string;
  }>({ enabled: false, message_ar: '', message_en: '' });
  const [safeModeActive, setSafeModeActive] = useState<boolean>(false);

  // Shop & Catalog state
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);

  // Product Detail & Variant Selection state
  const [selectedProductId, setSelectedProductId] = useState<string | null>(initLoc.productId || null);
  const [productDetail, setProductDetail] = useState<Product | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [detailQuantity, setDetailQuantity] = useState<number>(1);
  const [detailFeedback, setDetailFeedback] = useState<string | null>(null);

  // Cart & Revalidation state
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem('orbixa_cart_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [revalidation, setRevalidation] = useState<CartRevalidationResponse | null>(null);
  const [isRevalidating, setIsRevalidating] = useState<boolean>(false);
  const [priceChangeApproved, setPriceChangeApproved] = useState<boolean>(false);

  // Guest WhatsApp Verification & Checkout state
  const [verification, setVerification] = useState<WhatsAppVerification | null>(() => {
    try {
      const saved = localStorage.getItem('orbixa_wa_verification_v1');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [waCustomerName, setWaCustomerName] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('orbixa_wa_verification_v1');
      return saved ? JSON.parse(saved).customer_name || '' : '';
    } catch {
      return '';
    }
  });
  const [waCountryCode, setWaCountryCode] = useState<string>('+970');
  const [waLocalDigits, setWaLocalDigits] = useState<string>('');
  const [waError, setWaError] = useState<string | null>(null);
  const [waBusy, setWaBusy] = useState<boolean>(false);

  const [paymentMethod, setPaymentMethod] = useState<'reflect_ils' | 'binance_usdt'>('reflect_ils');
  const [checkoutIdempotencyKey, setCheckoutIdempotencyKey] = useState<string>(() => generateIdempotencyKey());
  const [checkoutBusy, setCheckoutBusy] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Order Confirmation & Private Tracking state
  const [trackingTokenInput, setTrackingTokenInput] = useState<string>(() => {
    if (initLoc.token) return initLoc.token;
    try {
      return localStorage.getItem('orbixa_last_tracking_token') || '';
    } catch {
      return '';
    }
  });
  const [activeTrackingToken, setActiveTrackingToken] = useState<string>(initLoc.token || '');
  const [trackingData, setTrackingData] = useState<PublicOrderTracking | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackingLoading, setTrackingLoading] = useState<boolean>(false);
  const [copyOrderFeedback, setCopyOrderFeedback] = useState<boolean>(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  // Payment Report Submission state
  const [reportHolderName, setReportHolderName] = useState<string>('');
  const [reportTxRef, setReportTxRef] = useState<string>('');
  const [reportNote, setReportNote] = useState<string>('');
  const [reportSubmitting, setReportSubmitting] = useState<boolean>(false);
  const [reportFeedback, setReportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Post-order WhatsApp change request state
  const [newWaCountryCode, setNewWaCountryCode] = useState<string>('+970');
  const [newWaDigits, setNewWaDigits] = useState<string>('');
  const [newWaFeedback, setNewWaFeedback] = useState<string | null>(null);

  // Admin Authentication & Dashboard state
  const [adminUser, setAdminUser] = useState<string | null>(null);
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState<boolean>(false);

  const [adminTab, setAdminTab] = useState<
    'overview' | 'whatsapp' | 'orders' | 'waiting' | 'catalog' | 'tasks' | 'cms' | 'reports'
  >('overview');
  const [adminMetrics, setAdminMetrics] = useState<any>(null);
  const [adminVerifications, setAdminVerifications] = useState<any[]>([]);
  const [adminOrders, setAdminOrders] = useState<any[]>([]);
  const [adminOrderFilterStatus, setAdminOrderFilterStatus] = useState<string>('');
  const [adminOrderSearch, setAdminOrderSearch] = useState<string>('');
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [adminCategories, setAdminCategories] = useState<Category[]>([]);
  const [adminTasks, setAdminTasks] = useState<any[]>([]);
  const [adminTaskFilter, setAdminTaskFilter] = useState<string>('OPEN');
  const [adminSupportRecords, setAdminSupportRecords] = useState<any[]>([]);
  const [adminCmsState, setAdminCmsState] = useState<any>(null);
  const [adminFullSettings, setAdminFullSettings] = useState<any>(null);
  const [adminTemplates, setAdminTemplates] = useState<Record<string, { ar: string; en: string }>>({});
  const [adminReportType, setAdminReportType] = useState<string>('financial_overview');
  const [adminReportData, setAdminReportData] = useState<any>(null);
  const [adminAuditLogs, setAdminAuditLogs] = useState<any[]>([]);
  const [adminErrorLogs, setAdminErrorLogs] = useState<any[]>([]);
  const [adminNotice, setAdminNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Admin forms state
  const [newCatNameAr, setNewCatNameAr] = useState<string>('');
  const [newCatNameEn, setNewCatNameEn] = useState<string>('');
  const [newCatSlug, setNewCatSlug] = useState<string>('');

  const [newProdNameAr, setNewProdNameAr] = useState<string>('');
  const [newProdNameEn, setNewProdNameEn] = useState<string>('');
  const [newProdDescAr, setNewProdDescAr] = useState<string>('');
  const [newProdDescEn, setNewProdDescEn] = useState<string>('');
  const [newProdType, setNewProdType] = useState<'SUBSCRIPTION' | 'DIGITAL_CODE' | 'MANUAL_SERVICE'>('SUBSCRIPTION');
  const [newProdCategoryId, setNewProdCategoryId] = useState<string>('');
  const [newProdPriceIls, setNewProdPriceIls] = useState<string>('100');
  const [newProdCostIls, setNewProdCostIls] = useState<string>('70');
  const [newProdStock, setNewProdStock] = useState<string>('10');
  const [newProdVariantNameAr, setNewProdVariantNameAr] = useState<string>('');
  const [newProdVariantNameEn, setNewProdVariantNameEn] = useState<string>('');
  const [newProdVariantPrice, setNewProdVariantPrice] = useState<string>('');
  const [newProdVariantStock, setNewProdVariantStock] = useState<string>('');
  const [csvImportText, setCsvImportText] = useState<string>('');

  const [reviewAmounts, setReviewAmounts] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [fulfillCodes, setFulfillCodes] = useState<Record<string, string>>({});
  const [fulfillDescriptions, setFulfillDescriptions] = useState<Record<string, string>>({});
  const [waitingCustomName, setWaitingCustomName] = useState<Record<string, string>>({});
  const [waitingPreviewLink, setWaitingPreviewLink] = useState<Record<string, string>>({});
  const [taskOutcomeInputs, setTaskOutcomeInputs] = useState<Record<string, string>>({});
  const [reconcileInputs, setReconcileInputs] = useState<Record<string, { stock: string; reason: string }>>({});
  const [settingsReason, setSettingsReason] = useState<string>('Routine admin update');
  const [cmsPreviewMode, setCmsPreviewMode] = useState<boolean>(false);

  const [newSupportOrderNum, setNewSupportOrderNum] = useState<string>('');
  const [newSupportCustomer, setNewSupportCustomer] = useState<string>('');
  const [newSupportPhone, setNewSupportPhone] = useState<string>('');
  const [newSupportSummary, setNewSupportSummary] = useState<string>('');

  const [currentPasswordInput, setCurrentPasswordInput] = useState<string>('');
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');

  const t = UI_STRINGS[lang];

  // Language persistence
  useEffect(() => {
    persistLanguageChoice(lang);
  }, [lang]);

  // Cart persistence
  useEffect(() => {
    try {
      localStorage.setItem('orbixa_cart_v1', JSON.stringify(cart));
    } catch {
      // Ignore storage error
    }
  }, [cart]);

  // Verification persistence
  useEffect(() => {
    try {
      if (verification) {
        localStorage.setItem('orbixa_wa_verification_v1', JSON.stringify(verification));
      }
    } catch {
      // Ignore storage error
    }
  }, [verification]);

  const navigateTo = useCallback((nextRoute: RouteView, opts?: { productId?: string; trackingToken?: string }) => {
    setRoute(nextRoute);
    if (opts?.productId) setSelectedProductId(opts.productId);
    if (opts?.trackingToken) {
      setTrackingTokenInput(opts.trackingToken);
      setActiveTrackingToken(opts.trackingToken);
    }
    if (typeof window !== 'undefined' && window.history?.pushState) {
      let url = '/';
      if (nextRoute === 'shop') url = '/shop';
      else if (nextRoute === 'product' && opts?.productId) url = `/product/${opts.productId}`;
      else if (nextRoute === 'cart') url = '/cart';
      else if (nextRoute === 'track') url = opts?.trackingToken ? `/track/${opts.trackingToken}` : '/track';
      else if (nextRoute !== 'home') url = `/${nextRoute}`;
      try {
        window.history.pushState({}, '', url);
      } catch {
        // Ignore in sandboxed iframe origins
      }
    }
  }, []);

  // Load Storefront Init
  const loadStorefrontInit = useCallback(async () => {
    try {
      const res = await apiRequest<any>('/storefront/init');
      if (res.cms) setCms(res.cms);
      if (res.settings) setStoreSettings(res.settings);
      setCategories(res.categories || []);
      setUsdtRateInfo(res.usdt_rate_info || null);
      if (res.maintenance_mode) setMaintenanceMode(res.maintenance_mode);
      if (res.safe_mode) setSafeModeActive(Boolean(res.safe_mode.active));
    } catch {
      // Handled by per-section states
    }
  }, []);

  useEffect(() => {
    loadStorefrontInit();
  }, [loadStorefrontInit]);

  // Load Products
  const fetchProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    setProductsError(null);
    try {
      const res = await apiRequest<any>(
        `/products?q=${encodeURIComponent(searchQuery)}&category_id=${encodeURIComponent(selectedCategory)}&sort=${encodeURIComponent(sortBy)}&offset=0&limit=12`
      );
      setProducts(res.items || []);
      setHasMore(Boolean(res.has_more));
      setOffset(0);
    } catch (err: any) {
      setProductsError(err?.message || 'Unable to load catalog products.');
    } finally {
      setIsLoadingProducts(false);
    }
  }, [searchQuery, selectedCategory, sortBy]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const loadMoreProducts = async () => {
    const nextOffset = offset + 12;
    setIsLoadingProducts(true);
    try {
      const res = await apiRequest<any>(
        `/products?q=${encodeURIComponent(searchQuery)}&category_id=${encodeURIComponent(selectedCategory)}&sort=${encodeURIComponent(sortBy)}&offset=${nextOffset}&limit=12`
      );
      setProducts((prev) => [...prev, ...(res.items || [])]);
      setHasMore(Boolean(res.has_more));
      setOffset(nextOffset);
    } catch (err: any) {
      setProductsError(err?.message || 'Unable to load additional products.');
    } finally {
      setIsLoadingProducts(false);
    }
  };

  // Load Product Detail when route === 'product'
  useEffect(() => {
    if (route !== 'product' || !selectedProductId) return;
    setIsLoadingDetail(true);
    setDetailError(null);
    setDetailFeedback(null);
    apiRequest<Product>(`/products/${encodeURIComponent(selectedProductId)}`)
      .then((prod) => {
        setProductDetail(prod);
        if (prod.variants && prod.variants.length > 0) {
          const firstAvail = prod.variants.find((v) => v.is_available) || prod.variants[0];
          setSelectedVariantId(firstAvail.variant_id);
        } else {
          setSelectedVariantId('');
        }
        setDetailQuantity(1);
      })
      .catch((err: any) => {
        setDetailError(err?.message || 'Product not found or unavailable.');
      })
      .finally(() => {
        setIsLoadingDetail(false);
      });
  }, [route, selectedProductId]);

  // Server-side Cart Revalidation
  const runCartRevalidation = useCallback(async (itemsToValidate: CartItem[]) => {
    if (itemsToValidate.length === 0) {
      setRevalidation(null);
      return null;
    }
    setIsRevalidating(true);
    try {
      const res = await apiRequest<CartRevalidationResponse>('/cart/revalidate', {
        method: 'POST',
        body: JSON.stringify({ items: itemsToValidate }),
      });
      setRevalidation(res);
      return res;
    } catch {
      return null;
    } finally {
      setIsRevalidating(false);
    }
  }, []);

  useEffect(() => {
    if (route === 'cart' && cart.length > 0) {
      runCartRevalidation(cart);
    } else if (cart.length === 0) {
      setRevalidation(null);
    }
  }, [route, cart, runCartRevalidation]);

  // Cart manipulation helpers
  const addItemToCart = (product: Product, variant?: ProductVariant | null, qty: number = 1) => {
    const unitPrice = variant ? variant.price_ils : product.price_ils;
    const itemSku = variant ? variant.sku : product.sku;
    const varId = variant ? variant.variant_id : null;

    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (item) => item.product_id === product.product_id && (item.variant_id || null) === varId
      );
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + Math.max(1, qty),
        };
        return updated;
      }
      return [
        ...prev,
        {
          product_id: product.product_id,
          variant_id: varId,
          variant_name_ar: variant ? variant.name_ar : undefined,
          variant_name_en: variant ? variant.name_en : undefined,
          sku: itemSku,
          product_type: product.product_type,
          name_ar: product.name_ar,
          name_en: product.name_en,
          quantity: Math.max(1, qty),
          client_unit_price_ils: unitPrice,
          image: (product.images && product.images[0]) || '/assets/orbixa-logo.jpg',
        },
      ];
    });
    setCheckoutIdempotencyKey(generateIdempotencyKey());
  };

  const updateCartItemQuantity = (index: number, nextQty: number) => {
    if (nextQty <= 0) {
      removeCartItem(index);
      return;
    }
    setCart((prev) => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], quantity: Math.min(99, Math.max(1, nextQty)) };
      }
      return copy;
    });
    setCheckoutIdempotencyKey(generateIdempotencyKey());
  };

  const removeCartItem = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
    setCheckoutIdempotencyKey(generateIdempotencyKey());
  };

  const approveServerPriceChanges = () => {
    if (!revalidation) return;
    setCart((prev) =>
      prev.map((item) => {
        const matched = revalidation.items.find(
          (r) => r.product_id === item.product_id && (r.variant_id || null) === (item.variant_id || null)
        );
        const srvPrice = matched?.unit_price_ils ?? matched?.server_unit_price_ils;
        if (matched && typeof srvPrice === 'number') {
          return { ...item, client_unit_price_ils: srvPrice };
        }
        return item;
      })
    );
    setPriceChangeApproved(true);
    setCheckoutError(null);
    setCheckoutIdempotencyKey(generateIdempotencyKey());
  };

  const removeUnavailableCartItems = () => {
    if (!revalidation) return;
    setCart((prev) =>
      prev.filter((item) => {
        const isRemoved = (revalidation.removed_unavailable || []).some(
          (u) => u.product_id === item.product_id && (u.variant_id || null) === (item.variant_id || null)
        );
        return !isRemoved;
      })
    );
    setCheckoutIdempotencyKey(generateIdempotencyKey());
  };

  // Guest WhatsApp verification handlers
  const handleRequestWhatsAppVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setWaError(null);
    setWaBusy(true);
    try {
      const res = await apiRequest<WhatsAppVerification>('/whatsapp/verify-request', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: waCustomerName,
          country_code: waCountryCode,
          local_digits: waLocalDigits,
          lang,
          previous_attempt_id: verification?.status === 'REJECTED' ? verification.verification_id : undefined,
          device_token: verification?.device_token,
        }),
      });
      setVerification(res);
    } catch (err: any) {
      setWaError(err?.message || 'WhatsApp verification request failed.');
    } finally {
      setWaBusy(false);
    }
  };

  const handleOpenWhatsAppLink = async () => {
    if (!verification) return;
    try {
      const openedRes = await apiRequest< any >(`/whatsapp/opened/${encodeURIComponent(verification.verification_id)}`, {
        method: 'POST',
      });
      setVerification((prev) => (prev ? { ...prev, status: openedRes.status, whatsapp_opened_at: openedRes.whatsapp_opened_at } : prev));
    } catch {
      // Continue opening link
    }
    if (typeof window !== 'undefined' && verification.whatsapp_url) {
      window.open(verification.whatsapp_url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCheckVerificationStatus = useCallback(async (vid?: string) => {
    const targetId = vid || verification?.verification_id;
    if (!targetId) return;
    try {
      const res = await apiRequest<WhatsAppVerification>(`/whatsapp/status/${encodeURIComponent(targetId)}`);
      setVerification((prev) => (prev ? { ...prev, ...res } : res));
    } catch (err: any) {
      setWaError(err?.message || 'Unable to check verification status.');
    }
  }, [verification?.verification_id]);

  // Create Order at Checkout
  const handleCreateOrder = async () => {
    if (!verification || verification.status !== 'APPROVED') {
      setCheckoutError(
        lang === 'ar'
          ? 'يجب تأكيد رقم واتساب والموافقة عليه من الإدارة قبل إنشاء الطلب.'
          : 'Your WhatsApp number must be verified and approved before creating an order.'
      );
      return;
    }
    if (cart.length === 0) return;

    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const res = await apiRequest<any>('/checkout/orders', {
        method: 'POST',
        body: JSON.stringify({
          idempotency_key: checkoutIdempotencyKey,
          verification_id: verification.verification_id,
          device_token: verification.device_token,
          customer_name: verification.customer_name || waCustomerName,
          whatsapp_phone: verification.normalized_phone,
          payment_method: paymentMethod,
          price_change_approved: priceChangeApproved,
          items: cart.map((item) => ({
            product_id: item.product_id,
            variant_id: item.variant_id || undefined,
            quantity: item.quantity,
            client_unit_price_ils: item.client_unit_price_ils,
          })),
        }),
      });

      const token = res.tracking_token;
      try {
        localStorage.setItem('orbixa_last_tracking_token', token);
      } catch {
        // Ignore storage error
      }
      setCart([]);
      setRevalidation(null);
      setPriceChangeApproved(false);
      setTrackingTokenInput(token);
      setActiveTrackingToken(token);
      await loadOrderTracking(token);
      navigateTo('track', { trackingToken: token });
    } catch (err: any) {
      if (err?.code === 'PRICE_CHANGE_APPROVAL_REQUIRED') {
        await runCartRevalidation(cart);
      }
      setCheckoutError(err?.message || 'Checkout failed.');
    } finally {
      setCheckoutBusy(false);
    }
  };

  // Load Private Order Tracking
  const loadOrderTracking = useCallback(async (rawToken: string, preserveFeedback: boolean = false) => {
    const cleaned = (rawToken || '').trim();
    if (!cleaned) return;
    setTrackingLoading(true);
    setTrackingError(null);
    if (!preserveFeedback) {
      setReportFeedback(null);
    }

    // If user typed an ORB-... order number instead of their private token, call the order-number endpoint so the backend returns the explicit 403 privacy rule
    if (cleaned.toUpperCase().startsWith('ORB-')) {
      try {
        await apiRequest(`/orders/by-number/${encodeURIComponent(cleaned)}`);
      } catch (err: any) {
        setTrackingData(null);
        setTrackingError(err?.message || 'Private tracking token is required.');
        setTrackingLoading(false);
        return;
      }
    }

    try {
      const data = await apiRequest<PublicOrderTracking>(`/track/${encodeURIComponent(cleaned)}`);
      setTrackingData(data);
      setActiveTrackingToken(cleaned);
    } catch (err: any) {
      setTrackingData(null);
      setTrackingError(err?.message || 'Invalid or revoked tracking token.');
    } finally {
      setTrackingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (route === 'track' && activeTrackingToken && !trackingData) {
      loadOrderTracking(activeTrackingToken);
    }
  }, [route, activeTrackingToken, trackingData, loadOrderTracking]);

  // 20-Minute Countdown Timer for AWAITING_PAYMENT_REPORT
  useEffect(() => {
    if (!trackingData || trackingData.status !== 'AWAITING_PAYMENT_REPORT' || !trackingData.payment_deadline_at) {
      setCountdownSeconds(null);
      return;
    }
    const updateTimer = () => {
      const deadlineMs = new Date(trackingData.payment_deadline_at).getTime();
      const diffSec = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));
      setCountdownSeconds(diffSec);
    };
    updateTimer();
    const timerId = setInterval(updateTimer, 1000);
    return () => clearInterval(timerId);
  }, [trackingData]);

  const handleCopyOrderNumber = async () => {
    if (!trackingData) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(trackingData.order_number);
      }
    } catch {
      // Fallback
    }
    setCopyOrderFeedback(true);
    setTimeout(() => setCopyOrderFeedback(false), 2000);
  };

  const handleSubmitPaymentReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrackingToken || !trackingData) return;
    setReportSubmitting(true);
    setReportFeedback(null);
    try {
      const res = await apiRequest<any>(`/track/${encodeURIComponent(activeTrackingToken)}/report-payment`, {
        method: 'POST',
        body: JSON.stringify({
          transaction_reference: trackingData.payment_method === 'binance_usdt' ? reportTxRef : undefined,
          account_holder_name: trackingData.payment_method === 'reflect_ils' ? reportHolderName : undefined,
          customer_note: reportNote,
        }),
      });
      setReportFeedback({
        type: 'success',
        message:
          lang === 'ar'
            ? `تم استلام إشعار الدفع بنجاح (${res.payment_status}). طلبك الآن قيد المراجعة اليدوية من الإدارة.`
            : `Payment report received (${res.payment_status}). Your order is now queued for manual administrator verification.`,
      });
      await loadOrderTracking(activeTrackingToken, true);
    } catch (err: any) {
      setReportFeedback({
        type: 'error',
        message: err?.message || 'Payment report submission failed.',
      });
      await loadOrderTracking(activeTrackingToken, true);
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleRequestPostOrderWhatsAppChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrackingToken) return;
    setNewWaFeedback(null);
    try {
      const res = await apiRequest<WhatsAppVerification>(
        `/track/${encodeURIComponent(activeTrackingToken)}/change-whatsapp`,
        {
          method: 'POST',
          body: JSON.stringify({
            customer_name: waCustomerName || 'Customer',
            country_code: newWaCountryCode,
            local_digits: newWaDigits,
            lang,
          }),
        }
      );
      setNewWaFeedback(
        lang === 'ar'
          ? `تم تسجيل طلب تغيير رقم واتساب (رمز التحقق: ${res.verification_code}). سيتفعل الرقم الجديد بعد موافقة الإدارة اليدوية.`
          : `WhatsApp change request submitted (Code: ${res.verification_code}). The new number activates after manual admin approval.`
      );
      setNewWaDigits('');
    } catch (err: any) {
      setNewWaFeedback(err?.message || 'Unable to submit WhatsApp number change request.');
    }
  };

  // ---------------------------------------------------------------------------
  // Admin Dashboard Data Loader & Actions
  // ---------------------------------------------------------------------------
  const refreshAdminData = useCallback(async () => {
    if (!adminUser) return;
    try {
      const [
        dashRes,
        waRes,
        ordRes,
        prodRes,
        catRes,
        taskRes,
        supRes,
        cmsRes,
        setRes,
        tplRes,
        repRes,
        audRes,
        errRes,
      ] = await Promise.all([
        apiRequest<any>('/admin/dashboard'),
        apiRequest<any>('/admin/whatsapp-verifications'),
        apiRequest<any>(
          `/admin/orders?status=${encodeURIComponent(adminOrderFilterStatus)}&q=${encodeURIComponent(adminOrderSearch)}`
        ),
        apiRequest<any>('/admin/products'),
        apiRequest<any>('/admin/categories'),
        apiRequest<any>(`/admin/tasks?status=${encodeURIComponent(adminTaskFilter)}`),
        apiRequest<any>('/admin/support'),
        apiRequest<any>('/admin/cms'),
        apiRequest<any>('/admin/settings'),
        apiRequest<any>('/admin/whatsapp-templates'),
        apiRequest<any>(`/admin/reports?type=${encodeURIComponent(adminReportType)}`),
        apiRequest<any>('/admin/audit-logs'),
        apiRequest<any>('/admin/error-logs'),
      ]);
      setAdminMetrics(dashRes);
      setAdminVerifications(waRes.items || []);
      setAdminOrders(ordRes.items || []);
      setAdminProducts(prodRes.items || []);
      setAdminCategories(catRes.items || []);
      setAdminTasks(taskRes.items || []);
      setAdminSupportRecords(supRes.items || []);
      setAdminCmsState(cmsRes);
      setAdminFullSettings(setRes);
      setAdminTemplates(tplRes.templates || {});
      setAdminReportData(repRes);
      setAdminAuditLogs(audRes.items || []);
      setAdminErrorLogs(errRes.items || []);
    } catch (err: any) {
      if (err?.status === 401) {
        setAdminUser(null);
        setCsrfToken(null);
      }
    }
  }, [adminUser, adminOrderFilterStatus, adminOrderSearch, adminTaskFilter, adminReportType]);

  useEffect(() => {
    if (adminUser && route === 'admin') {
      refreshAdminData();
    }
  }, [adminUser, route, refreshAdminData]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginBusy(true);
    try {
      const res = await apiRequest<{ authenticated: boolean; username: string; csrf_token: string }>(
        '/admin/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ username: loginUsername, password: loginPassword }),
        }
      );
      setCsrfToken(res.csrf_token);
      setAdminUser(res.username);
      setLoginPassword('');
      navigateTo('admin');
    } catch (err: any) {
      setLoginError(err?.message || 'Invalid administrator credentials.');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleAdminLogout = async () => {
    try {
      await apiRequest('/admin/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    setCsrfToken(null);
    setAdminUser(null);
    navigateTo('home');
  };

  const handleAdminReviewWhatsApp = async (verificationId: string, decision: 'APPROVE' | 'REJECT') => {
    try {
      await apiRequest(`/admin/whatsapp-verifications/${encodeURIComponent(verificationId)}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          rejection_reason: decision === 'REJECT' ? 'Rejected by administrator during verification review' : undefined,
        }),
      });
      setAdminNotice({ type: 'success', text: `WhatsApp verification ${verificationId} marked ${decision}.` });
      await refreshAdminData();
    } catch (err: any) {
      setAdminNotice({ type: 'error', text: err?.message || 'Review failed.' });
    }
  };

  const handleAdminCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/admin/categories', {
        method: 'POST',
        body: JSON.stringify({
          name_ar: newCatNameAr,
          name_en: newCatNameEn,
          slug: newCatSlug || undefined,
          display_order: adminCategories.length + 1,
          is_active: true,
        }),
      });
      setNewCatNameAr('');
      setNewCatNameEn('');
      setNewCatSlug('');
      setAdminNotice({ type: 'success', text: 'Category created.' });
      await refreshAdminData();
      await loadStorefrontInit();
    } catch (err: any) {
      setAdminNotice({ type: 'error', text: err?.message || 'Category creation failed.' });
    }
  };

  const handleAdminCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const variantsPayload =
        newProdVariantNameAr.trim() && newProdVariantNameEn.trim()
          ? [
              {
                name_ar: newProdVariantNameAr.trim(),
                name_en: newProdVariantNameEn.trim(),
                duration_label_ar: newProdVariantNameAr.trim(),
                duration_label_en: newProdVariantNameEn.trim(),
                price_ils: parseFloat(newProdVariantPrice || newProdPriceIls || '100'),
                actual_stock: parseInt(newProdVariantStock || newProdStock || '5', 10),
                supplier_cost_ils: parseFloat(newProdCostIls || '70'),
              },
            ]
          : [];

      await apiRequest('/admin/products', {
        method: 'POST',
        body: JSON.stringify({
          name_ar: newProdNameAr,
          name_en: newProdNameEn,
          description_ar: newProdDescAr,
          description_en: newProdDescEn,
          category_id: newProdCategoryId,
          product_type: newProdType,
          price_ils: parseFloat(newProdPriceIls || '100'),
          supplier_cost_ils: parseFloat(newProdCostIls || '0'),
          actual_stock: parseInt(newProdStock || '10', 10),
          is_featured: true,
          variants: variantsPayload,
        }),
      });
      setNewProdNameAr('');
      setNewProdNameEn('');
      setNewProdDescAr('');
      setNewProdDescEn('');
      setNewProdVariantNameAr('');
      setNewProdVariantNameEn('');
      setAdminNotice({ type: 'success', text: 'Product created and published to catalog.' });
      await refreshAdminData();
      await fetchProducts();
    } catch (err: any) {
      setAdminNotice({ type: 'error', text: err?.message || 'Product creation failed.' });
    }
  };

  const handleAdminReviewPayment = async (
    orderNumber: string,
    action: 'CONFIRM' | 'REJECT' | 'MARK_UNDERPAID' | 'MARK_UNVERIFIED',
    defaultAmount: number
  ) => {
    const rawAmt = reviewAmounts[orderNumber];
    const verifiedAmt = rawAmt !== undefined && rawAmt !== '' ? parseFloat(rawAmt) : defaultAmount;
    const note = reviewNotes[orderNumber] || '';
    try {
      await apiRequest(`/admin/orders/${encodeURIComponent(orderNumber)}/review-payment`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          verified_received_amount: verifiedAmt,
          rejection_reason: action === 'REJECT' ? note || 'Payment transfer could not be verified' : undefined,
          discrepancy_note: note || undefined,
          overpayment_resolution_note: note || undefined,
          duplicate_override_note: note || undefined,
        }),
      });
      setAdminNotice({ type: 'success', text: `Order ${orderNumber} payment reviewed (${action}).` });
      await refreshAdminData();
    } catch (err: any) {
      setAdminNotice({ type: 'error', text: err?.message || 'Payment review failed.' });
    }
  };

  const handleAdminFulfillOrder = async (order: any) => {
    const codeInput = (fulfillCodes[order.order_number] || 'ORBIXA-DELIVERED-CODE-001').trim();
    const descInput = (fulfillDescriptions[order.order_number] || 'Delivered via official Orbixa WhatsApp').trim();

    const deliveryItems = (order.items || []).map((item: any, idx: number) => ({
      product_id: item.product_id,
      variant_id: item.variant_id || undefined,
      delivery_type: item.product_type === 'DIGITAL_CODE' ? 'DIGITAL_CODE' : 'SUBSCRIPTION_INVITE',
      delivered_description: descInput,
      digital_codes:
        item.product_type === 'DIGITAL_CODE'
          ? Array.from({ length: item.quantity || 1 }, (_, cIdx) => `${codeInput}-${idx + 1}-${cIdx + 1}`)
          : [],
    }));

    try {
      await apiRequest(`/admin/orders/${encodeURIComponent(order.order_number)}/fulfill`, {
        method: 'POST',
        body: JSON.stringify({
          delivery_items: deliveryItems,
          lang,
          instructions_for_whatsapp: descInput,
        }),
      });
      setAdminNotice({ type: 'success', text: `Order ${order.order_number} fulfilled completely.` });
      await refreshAdminData();
    } catch (err: any) {
      setAdminNotice({ type: 'error', text: err?.message || 'Fulfillment failed.' });
    }
  };

  const handleAdminDeliveryFailed = async (orderNumber: string) => {
    const reason = reviewNotes[orderNumber] || 'Temporary supplier stock outage';
    try {
      await apiRequest(`/admin/orders/${encodeURIComponent(orderNumber)}/delivery-failed`, {
        method: 'POST',
        body: JSON.stringify({ failure_reason: reason, lang }),
      });
      setAdminNotice({ type: 'success', text: `Order ${orderNumber} marked as Delivery Failed.` });
      await refreshAdminData();
    } catch (err: any) {
      setAdminNotice({ type: 'error', text: err?.message || 'Failed to mark delivery failure.' });
    }
  };

  const handleAdminMoveToWaiting = async (orderNumber: string) => {
    const note = reviewNotes[orderNumber] || 'Customer agreed to wait for restock';
    try {
      await apiRequest(`/admin/orders/${encodeURIComponent(orderNumber)}/move-to-waiting`, {
        method: 'POST',
        body: JSON.stringify({ customer_note: note }),
      });
      setAdminNotice({ type: 'success', text: `Order ${orderNumber} moved to الطلبات المنتظرة.` });
      await refreshAdminData();
    } catch (err: any) {
      setAdminNotice({ type: 'error', text: err?.message || 'Failed to move order to waiting list.' });
    }
  };

  const handleAdminPreviewWaitingAvailable = async (orderNumber: string, defaultName: string) => {
    const customName = waitingCustomName[orderNumber] || defaultName;
    try {
      const res = await apiRequest<any>(
        `/admin/orders/${encodeURIComponent(orderNumber)}/waiting-available-preview`,
        {
          method: 'POST',
          body: JSON.stringify({
            available_product_name_for_message: customName,
            lang,
            optional_instructions: 'Ready for immediate activation.',
          }),
        }
      );
      setWaitingPreviewLink((prev) => ({ ...prev, [orderNumber]: res.whatsapp_url || res.rendered_message }));
      setAdminNotice({ type: 'success', text: `Availability message generated for ${orderNumber}.` });
    } catch (err: any) {
      setAdminNotice({ type: 'error', text: err?.message || 'Unable to generate waiting availability preview.' });
    }
  };

  const activeCmsData: StorefrontCms | null =
    cmsPreviewMode && adminCmsState?.draft ? adminCmsState.draft : cms;

  const totalCartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotalIls = revalidation
    ? revalidation.server_total_ils
    : cart.reduce((sum, item) => sum + item.client_unit_price_ils * item.quantity, 0);

  // Maintenance Screen for Public Visitors (Admin Login & Admin Dashboard remain accessible)
  if (maintenanceMode.enabled && route !== 'admin' && route !== 'login') {
    return (
      <main
        data-testid="maintenance-screen"
        className="min-h-screen bg-[#080B16] text-[#F4F5FF] flex flex-col items-center justify-center p-6 text-center"
      >
        <img
          src="/assets/orbixa-logo.jpg"
          alt="Orbixa Store"
          className="w-24 h-24 rounded-full mb-6 border border-[#7C5CFC]/40"
        />
        <h1 className="text-3xl font-bold mb-3">
          {lang === 'ar' ? 'المتجر في وضع الصيانة المجدولة' : 'Scheduled Cosmic Maintenance'}
        </h1>
        <p className="max-w-xl text-slate-300 mb-6">
          {lang === 'ar' ? maintenanceMode.message_ar : maintenanceMode.message_en}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="px-4 py-2 rounded-lg border border-[#7C5CFC]/50 text-sm"
          >
            {lang === 'ar' ? 'English' : 'العربية'}
          </button>
          <button
            type="button"
            onClick={() => navigateTo('track')}
            className="px-4 py-2 rounded-lg border border-[#21D4FD]/50 text-sm"
          >
            {t.navTrack}
          </button>
          <button
            type="button"
            onClick={() => navigateTo('login')}
            className="px-4 py-2 rounded-lg bg-[#7C5CFC] text-white text-sm"
          >
            {t.footerAdminLogin}
          </button>
        </div>
      </main>
    );
  }

  const activeVariant: ProductVariant | null =
    productDetail?.variants && productDetail.variants.length > 0
      ? productDetail.variants.find((v) => v.variant_id === selectedVariantId) || productDetail.variants[0]
      : null;

  const detailPriceIls = activeVariant ? activeVariant.price_ils : productDetail?.price_ils || 0;
  const detailAvailable = activeVariant ? activeVariant.is_available : Boolean(productDetail?.is_available);
  const detailSku = activeVariant ? activeVariant.sku : productDetail?.sku || '';

  return (
    <div className="min-h-screen bg-[#080B16] text-[#F4F5FF] flex flex-col">
      {/* Top Safe Mode Banner if active */}
      {safeModeActive && (
        <div
          role="status"
          className="bg-amber-500/20 border-b border-amber-400/40 text-amber-200 text-xs py-2 px-4 text-center"
        >
          {lang === 'ar'
            ? 'تنبيه تشغيلي: تم تفعيل الوضع الآمن مؤقتاً لحماية الطلبات الحالية أثناء فحص الاتصال.'
            : 'Operational Notice: Safe Mode is temporarily active to protect existing orders while connectivity is verified.'}
        </div>
      )}

      {/* Main Storefront Header — Admin link intentionally excluded from main nav per specification */}
      <header className="border-b border-white/10 bg-[#080B16]/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigateTo('home')}
            className="flex items-center gap-3 text-start"
            data-testid="brand-logo-btn"
          >
            <img src="/assets/orbixa-logo.jpg" alt="Orbixa Logo" className="w-10 h-10 rounded-full object-cover" />
            <div>
              <span className="font-extrabold tracking-wider text-lg bg-gradient-to-r from-[#7C5CFC] to-[#21D4FD] bg-clip-text text-transparent block">
                ORBIXA STORE
              </span>
              <span className="text-[11px] text-slate-400 block">orbixashop.web.id</span>
            </div>
          </button>

          <nav data-testid="main-header-nav" aria-label="Main Navigation" className="flex flex-wrap items-center gap-3 md:gap-5 text-sm">
            <button
              type="button"
              data-testid="nav-home"
              onClick={() => navigateTo('home')}
              className={route === 'home' ? 'text-[#21D4FD] font-bold' : 'hover:text-[#21D4FD]'}
            >
              {t.navHome}
            </button>
            <button
              type="button"
              data-testid="nav-shop"
              onClick={() => navigateTo('shop')}
              className={route === 'shop' || route === 'product' ? 'text-[#21D4FD] font-bold' : 'hover:text-[#21D4FD]'}
            >
              {t.navShop}
            </button>
            <button
              type="button"
              data-testid="nav-track"
              onClick={() => navigateTo('track')}
              className={route === 'track' ? 'text-[#21D4FD] font-bold' : 'hover:text-[#21D4FD]'}
            >
              {t.navTrack}
            </button>
            <button
              type="button"
              data-testid="nav-about"
              onClick={() => navigateTo('about')}
              className={route === 'about' ? 'text-[#21D4FD] font-bold' : 'hover:text-[#21D4FD]'}
            >
              {t.navAbout}
            </button>
            <button
              type="button"
              data-testid="nav-faq"
              onClick={() => navigateTo('faq')}
              className={route === 'faq' ? 'text-[#21D4FD] font-bold' : 'hover:text-[#21D4FD]'}
            >
              {t.navFaq}
            </button>
            <button
              type="button"
              data-testid="nav-contact"
              onClick={() => navigateTo('contact')}
              className={route === 'contact' ? 'text-[#21D4FD] font-bold' : 'hover:text-[#21D4FD]'}
            >
              {t.navContact}
            </button>
            <button
              type="button"
              data-testid="nav-policies"
              onClick={() => navigateTo('policies')}
              className={route === 'policies' ? 'text-[#21D4FD] font-bold' : 'hover:text-[#21D4FD]'}
            >
              {t.navPolicies}
            </button>
            <button
              type="button"
              data-testid="nav-cart"
              onClick={() => navigateTo('cart')}
              className="px-3 py-1.5 rounded-xl bg-[#7C5CFC]/20 border border-[#7C5CFC]/50 hover:bg-[#7C5CFC]/30 font-semibold"
            >
              {t.navCart} (<bdi dir="ltr" data-testid="cart-count-badge">{totalCartItemsCount}</bdi>)
            </button>
            <button
              type="button"
              data-testid="lang-toggle-btn"
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="px-3 py-1.5 rounded-full border border-[#21D4FD]/60 text-xs font-bold text-[#21D4FD]"
            >
              {lang === 'ar' ? 'EN' : 'عربي'}
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">
        {/* =====================================================================
            1. HOME VIEW
           ===================================================================== */}
        {route === 'home' && (
          <div data-testid="home-view" className="space-y-12">
            {((activeCmsData?.homepage?.sections || [
              { id: 'hero', type: 'hero', enabled: true, order: 1 },
              { id: 'categories', type: 'categories', enabled: true, order: 2 },
              { id: 'featured', type: 'featured', enabled: true, order: 3 },
              { id: 'promo', type: 'promo', enabled: true, order: 4 },
            ]) as CmsSectionConfig[])
              .filter((s) => s.enabled !== false)
              .sort((a, b) => (a.order || 1) - (b.order || 1))
              .map((sec) => {
                if (sec.type === 'hero') {
                  const copy = activeCmsData?.homepage?.[lang];
                  return (
                    <section
                      key={sec.id}
                      className="rounded-3xl overflow-hidden border border-[#7C5CFC]/30 bg-[#0E1326] grid md:grid-cols-2 items-center p-8 gap-8 shadow-2xl"
                    >
                      <div className="space-y-4">
                        <p className="text-xs uppercase tracking-widest text-[#21D4FD] font-semibold">
                          {copy?.headline || t.heroHeadline}
                        </p>
                        <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-white via-[#7C5CFC] to-[#21D4FD] bg-clip-text text-transparent">
                          {copy?.supporting_headline || t.heroSupporting}
                        </h1>
                        <p className="text-slate-300 leading-relaxed">
                          {copy?.description || t.heroDescription}
                        </p>
                        <div className="flex flex-wrap gap-3 pt-2">
                          <button
                            type="button"
                            data-testid="hero-explore-shop-btn"
                            onClick={() => navigateTo('shop')}
                            className="px-6 py-3 rounded-full bg-gradient-to-r from-[#7C5CFC] to-[#21D4FD] text-white font-bold shadow-lg"
                          >
                            {copy?.primary_cta || t.heroCta}
                          </button>
                          <button
                            type="button"
                            onClick={() => navigateTo('track')}
                            className="px-5 py-3 rounded-full border border-white/20 hover:border-[#21D4FD] text-sm font-semibold"
                          >
                            {t.navTrack}
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 pt-2">{copy?.tagline || t.heroTagline}</p>
                      </div>
                      <div>
                        <img
                          src={lang === 'ar' ? '/assets/hero-banner-ar.jpg' : '/assets/hero-banner-en.png'}
                          alt="Orbixa Banner"
                          className="w-full rounded-2xl border border-white/10 shadow-xl"
                        />
                      </div>
                    </section>
                  );
                }

                if (sec.type === 'categories') {
                  return (
                    <section key={sec.id} className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold">
                          {lang === 'ar' ? 'أقسام المنتجات الرقمية' : 'Digital Product Categories'}
                        </h2>
                        <button
                          type="button"
                          onClick={() => navigateTo('shop')}
                          className="text-sm text-[#21D4FD] hover:underline"
                        >
                          {lang === 'ar' ? 'عرض المتجر بالكامل ←' : 'View Full Catalog →'}
                        </button>
                      </div>
                      {categories.length === 0 ? (
                        <p className="text-sm text-slate-400">
                          {lang === 'ar'
                            ? 'يتم إعداد أقسام المنتجات من قبل إدارة المتجر.'
                            : 'Product categories are managed via the store administration console.'}
                        </p>
                      ) : (
                        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                          {categories.map((cat) => (
                            <button
                              key={cat.category_id}
                              type="button"
                              onClick={() => {
                                setSelectedCategory(cat.category_id);
                                navigateTo('shop');
                              }}
                              className="p-5 rounded-2xl border border-white/10 bg-[#0E1326] hover:border-[#7C5CFC] text-start transition"
                            >
                              <h3 className="font-bold text-base mb-1">
                                {lang === 'ar' ? cat.name_ar : cat.name_en}
                              </h3>
                              <p className="text-xs text-slate-400">
                                {lang === 'ar' ? cat.description_ar : cat.description_en}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                }

                if (sec.type === 'featured') {
                  const featuredList = products.filter((p) => p.is_featured).slice(0, 6);
                  const displayList = featuredList.length > 0 ? featuredList : products.slice(0, 6);
                  return (
                    <section key={sec.id} className="space-y-4">
                      <h2 className="text-2xl font-bold">
                        {lang === 'ar' ? 'المنتجات المميزة' : 'Featured Digital Products'}
                      </h2>
                      {displayList.length === 0 ? (
                        <div className="p-8 rounded-2xl border border-white/10 bg-[#0E1326]/60 text-center text-slate-300">
                          {t.emptyStoreNotice}
                        </div>
                      ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                          {displayList.map((p) => (
                            <article
                              key={p.product_id}
                              className="rounded-2xl border border-white/10 bg-[#0E1326] p-5 flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-center justify-between text-xs mb-2">
                                  <bdi dir="ltr" className="text-slate-400">{p.sku}</bdi>
                                  <span className={p.is_available ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                                    {p.is_available ? t.availableBadge : t.unavailableBadge}
                                  </span>
                                </div>
                                <h3 className="text-lg font-bold mb-1">
                                  {lang === 'ar' ? p.name_ar : p.name_en}
                                </h3>
                                <p className="text-sm text-slate-400 mb-4">
                                  {lang === 'ar' ? p.description_ar : p.description_en}
                                </p>
                              </div>
                              <div className="flex items-center justify-between pt-3 border-t border-white/10 gap-2">
                                <bdi dir="ltr" className="font-bold text-[#21D4FD]">
                                  {formatCurrencyILS(p.price_ils)}
                                </bdi>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => navigateTo('product', { productId: p.product_id })}
                                    className="px-3 py-1.5 rounded-lg border border-white/20 hover:border-[#21D4FD] text-xs font-semibold"
                                  >
                                    {t.viewDetails}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!p.is_available}
                                    onClick={() => addItemToCart(p, p.variants?.[0] || null, 1)}
                                    className="px-3 py-1.5 rounded-lg bg-[#7C5CFC] disabled:opacity-40 text-xs font-bold"
                                  >
                                    {t.addToCart}
                                  </button>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                }

                if (sec.type === 'promo') {
                  const copy = activeCmsData?.homepage?.[lang];
                  return (
                    <section
                      key={sec.id}
                      className="rounded-2xl border border-[#21D4FD]/30 bg-gradient-to-r from-[#0E1326] via-[#141B34] to-[#0E1326] p-6 md:p-8"
                    >
                      <h2 className="text-xl md:text-2xl font-bold text-[#21D4FD] mb-2">
                        {copy?.promo_banner_title ||
                          (lang === 'ar'
                            ? 'وصول موثوق لأفضل الأدوات والاشتراكات الرقمية'
                            : 'Instant Access to Global Digital Tools')}
                      </h2>
                      <p className="text-sm text-slate-300 mb-4">
                        {copy?.promo_banner_subtitle ||
                          (lang === 'ar'
                            ? 'تسليم رقمي موثق عبر واتساب بأسعار واضحة بالشيكل والـ USDT.'
                            : 'Verified manual delivery via WhatsApp with transparent ILS & USDT pricing.')}
                      </p>
                      <div className="grid sm:grid-cols-3 gap-4 text-xs text-slate-300">
                        <div className="p-3 rounded-xl bg-black/30 border border-white/10">
                          <strong className="text-white block mb-1">
                            {lang === 'ar' ? 'حماية حجز المخزون لمدة 20 دقيقة' : '20-Minute Stock Reservation'}
                          </strong>
                          {lang === 'ar'
                            ? 'يتم حجز منتجك فور إنشاء الطلب ولمدة 20 دقيقة لإتمام التحويل بأمان.'
                            : 'Your stock is atomically reserved for 20 minutes once your order is created.'}
                        </div>
                        <div className="p-3 rounded-xl bg-black/30 border border-white/10">
                          <strong className="text-white block mb-1">
                            {lang === 'ar' ? 'دفع حصري عبر Reflect و Binance' : 'Reflect ILS & Binance USDT'}
                          </strong>
                          {lang === 'ar'
                            ? 'أسعار واضحة بالشيكل (₪) أو بعملة USDT مع تجميد السعر لحظة الطلب.'
                            : 'Transparent ILS (₪) pricing and frozen USDT exchange rates at order creation.'}
                        </div>
                        <div className="p-3 rounded-xl bg-black/30 border border-white/10">
                          <strong className="text-white block mb-1">
                            {lang === 'ar' ? 'تأكيد واتساب لمرة واحدة' : 'One-Time Device WhatsApp Verification'}
                          </strong>
                          {lang === 'ar'
                            ? 'توثيق سريع لرقم واتساب يضمن وصول الأكواد والاشتراكات لرقمك الصحيح.'
                            : 'Verified WhatsApp contact ensures reliable delivery and instant support.'}
                        </div>
                      </div>
                    </section>
                  );
                }
                return null;
              })}
          </div>
        )}

        {/* =====================================================================
            2. SHOP VIEW (Search, Category Filters, Sort, Loading, Errors, Empty)
           ===================================================================== */}
        {route === 'shop' && (
          <section data-testid="shop-view" className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
              <input
                type="search"
                data-testid="shop-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.searchPlaceholder}
                className="px-4 py-2.5 rounded-xl bg-[#0E1326] border border-white/15 text-sm min-w-[260px]"
              />

              <div className="flex flex-wrap gap-2 items-center">
                <select
                  data-testid="shop-category-select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  aria-label={t.allCategories}
                  className="px-4 py-2.5 rounded-xl bg-[#0E1326] border border-white/15 text-sm"
                >
                  <option value="">{t.allCategories}</option>
                  {categories.map((cat) => (
                    <option key={cat.category_id} value={cat.category_id}>
                      {lang === 'ar' ? cat.name_ar : cat.name_en}
                    </option>
                  ))}
                </select>

                <select
                  data-testid="shop-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Sort products"
                  className="px-4 py-2.5 rounded-xl bg-[#0E1326] border border-white/15 text-sm"
                >
                  <option value="newest">{t.sortNewest}</option>
                  <option value="featured">{t.sortFeatured}</option>
                  <option value="name">{t.sortName}</option>
                  <option value="price_asc">{t.sortPriceAsc}</option>
                  <option value="price_desc">{t.sortPriceDesc}</option>
                </select>
              </div>
            </div>

            {/* Category Filter Pills */}
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
                    selectedCategory === ''
                      ? 'bg-[#7C5CFC] text-white border-[#7C5CFC]'
                      : 'bg-[#0E1326] text-slate-300 border-white/15'
                  }`}
                >
                  {t.allCategories}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.category_id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.category_id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
                      selectedCategory === cat.category_id
                        ? 'bg-[#7C5CFC] text-white border-[#7C5CFC]'
                        : 'bg-[#0E1326] text-slate-300 border-white/15'
                    }`}
                  >
                    {lang === 'ar' ? cat.name_ar : cat.name_en}
                  </button>
                ))}
              </div>
            )}

            {/* Loading State */}
            {isLoadingProducts && (
              <div
                data-testid="shop-loading"
                role="status"
                className="p-6 rounded-2xl border border-[#7C5CFC]/30 bg-[#0E1326]/60 text-center text-sm text-slate-300"
              >
                {lang === 'ar' ? 'جاري تحميل المنتجات الرقمية...' : 'Loading digital catalog...'}
              </div>
            )}

            {/* Error State */}
            {productsError && (
              <div
                data-testid="shop-error"
                role="alert"
                className="p-6 rounded-2xl border border-rose-500/40 bg-rose-950/30 text-rose-200 flex items-center justify-between"
              >
                <span>{productsError}</span>
                <button
                  type="button"
                  onClick={fetchProducts}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
                >
                  {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                </button>
              </div>
            )}

            {/* Empty Catalog State */}
            {!isLoadingProducts && !productsError && products.length === 0 ? (
              <div
                data-testid="shop-empty"
                className="p-12 rounded-2xl border border-white/10 bg-[#0E1326]/60 text-center text-slate-300"
              >
                {t.emptyStoreNotice}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map((p) => (
                  <article
                    key={p.product_id}
                    data-testid={`product-card-${p.product_id}`}
                    className="rounded-2xl border border-white/10 bg-[#0E1326] p-5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs mb-2">
                        <bdi dir="ltr" className="text-slate-400">{p.sku}</bdi>
                        <span className={p.is_available ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                          {p.is_available ? t.availableBadge : t.unavailableBadge}
                        </span>
                      </div>
                      <span className="inline-block text-[11px] px-2.5 py-0.5 rounded-full bg-[#7C5CFC]/20 text-[#21D4FD] mb-2">
                        {p.product_type}
                      </span>
                      <h3 className="text-lg font-bold mb-1">
                        {lang === 'ar' ? p.name_ar : p.name_en}
                      </h3>
                      <p className="text-sm text-slate-400 mb-4">
                        {lang === 'ar' ? p.description_ar : p.description_en}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-white/10 gap-2">
                      <bdi dir="ltr" className="font-bold text-[#21D4FD]">
                        {formatCurrencyILS(p.price_ils)}
                      </bdi>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          data-testid={`view-product-${p.product_id}`}
                          onClick={() => navigateTo('product', { productId: p.product_id })}
                          className="px-3 py-2 rounded-lg border border-white/20 hover:border-[#21D4FD] text-xs font-semibold"
                        >
                          {t.viewDetails}
                        </button>
                        <button
                          type="button"
                          data-testid={`add-to-cart-${p.product_id}`}
                          disabled={!p.is_available}
                          onClick={() => addItemToCart(p, p.variants?.[0] || null, 1)}
                          className="px-3.5 py-2 rounded-lg bg-[#7C5CFC] disabled:opacity-40 text-xs font-bold"
                        >
                          {t.addToCart}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {hasMore && (
              <div className="text-center pt-4">
                <button
                  type="button"
                  data-testid="load-more-products-btn"
                  onClick={loadMoreProducts}
                  className="px-6 py-2.5 rounded-xl border border-[#7C5CFC] text-sm font-semibold"
                >
                  {t.loadMore}
                </button>
              </div>
            )}
          </section>
        )}

        {/* =====================================================================
            3. PRODUCT DETAIL & VARIANT SELECTION VIEW
           ===================================================================== */}
        {route === 'product' && (
          <section data-testid="product-detail-view" className="space-y-6">
            <button
              type="button"
              onClick={() => navigateTo('shop')}
              className="text-sm text-[#21D4FD] hover:underline"
            >
              {t.backToShop}
            </button>

            {isLoadingDetail && (
              <div className="p-8 rounded-2xl border border-white/10 bg-[#0E1326] text-center">
                {lang === 'ar' ? 'جاري تحميل تفاصيل المنتج...' : 'Loading product details...'}
              </div>
            )}

            {detailError && (
              <div role="alert" className="p-6 rounded-2xl border border-rose-500/40 bg-rose-950/30 text-rose-200">
                {detailError}
              </div>
            )}

            {productDetail && !isLoadingDetail && (
              <div className="rounded-3xl border border-white/15 bg-[#0E1326] p-6 md:p-8 grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <img
                    src={(productDetail.images && productDetail.images[0]) || '/assets/orbixa-logo.jpg'}
                    alt={lang === 'ar' ? productDetail.name_ar : productDetail.name_en}
                    className="w-full max-h-80 object-cover rounded-2xl border border-white/10"
                  />
                  <div className="p-4 rounded-xl bg-black/30 border border-white/10 text-xs text-slate-300 space-y-1">
                    <strong className="text-white block">{t.deliveryInfoTitle}</strong>
                    <p>
                      {(lang === 'ar' ? productDetail.delivery_info_ar : productDetail.delivery_info_en) ||
                        (lang === 'ar'
                          ? 'يتم التسليم الرقمي عبر واتساب فور التحقق اليدوي من الحوالة.'
                          : 'Delivered digitally via WhatsApp immediately after manual payment verification.')}
                    </p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="flex items-center justify-between text-xs">
                    <bdi dir="ltr" data-testid="detail-sku" className="text-slate-400 font-mono">
                      {detailSku}
                    </bdi>
                    <span
                      data-testid="detail-availability"
                      className={detailAvailable ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}
                    >
                      {detailAvailable ? t.availableBadge : t.unavailableBadge}
                    </span>
                  </div>

                  <h1 className="text-2xl md:text-3xl font-extrabold">
                    {lang === 'ar' ? productDetail.name_ar : productDetail.name_en}
                  </h1>

                  <p className="text-slate-300 text-sm leading-relaxed">
                    {lang === 'ar' ? productDetail.description_ar : productDetail.description_en}
                  </p>

                  <div className="text-2xl font-extrabold text-[#21D4FD]">
                    <bdi dir="ltr" data-testid="detail-price-ils">{formatCurrencyILS(detailPriceIls)}</bdi>
                    {usdtRateInfo && usdtRateInfo.ils_per_usdt_rate > 0 && (
                      <span className="text-xs text-slate-400 block font-normal mt-1">
                        ≈ <bdi dir="ltr">{formatCurrencyUSDT(detailPriceIls / usdtRateInfo.ils_per_usdt_rate)}</bdi>
                      </span>
                    )}
                  </div>

                  {/* Variants Selector */}
                  {productDetail.variants && productDetail.variants.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                        {t.selectVariantLabel}
                      </label>
                      <div className="grid sm:grid-cols-2 gap-2.5">
                        {productDetail.variants.map((v) => {
                          const isSelected = v.variant_id === (activeVariant?.variant_id || '');
                          return (
                            <button
                              key={v.variant_id}
                              type="button"
                              data-testid={`variant-option-${v.variant_id}`}
                              onClick={() => setSelectedVariantId(v.variant_id)}
                              className={`p-3 rounded-xl border text-start transition ${
                                isSelected
                                  ? 'border-[#21D4FD] bg-[#7C5CFC]/25'
                                  : 'border-white/15 bg-black/30 hover:border-white/30'
                              }`}
                            >
                              <div className="font-bold text-sm">
                                {lang === 'ar' ? v.name_ar || v.duration_label_ar : v.name_en || v.duration_label_en}
                              </div>
                              <div className="flex items-center justify-between text-xs mt-1">
                                <bdi dir="ltr" className="text-[#21D4FD] font-semibold">
                                  {formatCurrencyILS(v.price_ils)}
                                </bdi>
                                <span className={v.is_available ? 'text-emerald-400' : 'text-rose-400'}>
                                  {v.is_available ? t.availableBadge : t.unavailableBadge}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Quantity & Add to Cart */}
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <div className="flex items-center border border-white/20 rounded-xl overflow-hidden bg-black/30">
                      <button
                        type="button"
                        onClick={() => setDetailQuantity((q) => Math.max(1, q - 1))}
                        className="px-3 py-2 text-sm font-bold hover:bg-white/10"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={detailQuantity}
                        onChange={(e) => setDetailQuantity(Math.max(1, parseInt(e.target.value || '1', 10)))}
                        aria-label={t.quantityLabel}
                        className="w-14 text-center bg-transparent text-sm font-bold py-2"
                      />
                      <button
                        type="button"
                        onClick={() => setDetailQuantity((q) => Math.min(99, q + 1))}
                        className="px-3 py-2 text-sm font-bold hover:bg-white/10"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      data-testid="product-detail-add-to-cart"
                      disabled={!detailAvailable}
                      onClick={() => {
                        addItemToCart(productDetail, activeVariant, detailQuantity);
                        setDetailFeedback(
                          lang === 'ar' ? 'تمت إضافة المنتج إلى السلة بنجاح!' : 'Added to cart!'
                        );
                      }}
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#7C5CFC] to-[#21D4FD] text-white font-bold text-sm disabled:opacity-40"
                    >
                      {t.addToCart}
                    </button>

                    <button
                      type="button"
                      data-testid="go-to-cart-from-detail"
                      onClick={() => navigateTo('cart')}
                      className="px-4 py-3 rounded-xl border border-[#21D4FD]/50 text-xs font-bold text-[#21D4FD]"
                    >
                      {t.navCart} ({totalCartItemsCount})
                    </button>
                  </div>

                  {detailFeedback && (
                    <p role="status" className="text-xs text-emerald-400 font-semibold">
                      {detailFeedback}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* =====================================================================
            4. CART & CHECKOUT VIEW (Revalidation, Price Approval, WhatsApp, Order Creation)
           ===================================================================== */}
        {route === 'cart' && (
          <section data-testid="cart-checkout-view" className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-2xl md:text-3xl font-extrabold">{t.cartTitle}</h1>
              {cart.length > 0 && (
                <button
                  type="button"
                  data-testid="revalidate-cart-btn"
                  onClick={() => runCartRevalidation(cart)}
                  disabled={isRevalidating}
                  className="px-4 py-2 rounded-xl border border-[#21D4FD]/50 text-xs font-semibold text-[#21D4FD]"
                >
                  {isRevalidating ? '...' : t.revalidateCartBtn}
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div
                data-testid="empty-cart-state"
                className="p-12 rounded-2xl border border-white/10 bg-[#0E1326] text-center space-y-4"
              >
                <p className="text-slate-300">{t.emptyCartNotice}</p>
                <button
                  type="button"
                  onClick={() => navigateTo('shop')}
                  className="px-6 py-2.5 rounded-xl bg-[#7C5CFC] text-white text-sm font-bold"
                >
                  {t.heroCta}
                </button>
              </div>
            ) : (
              <div className="grid lg:grid-cols-12 gap-8">
                {/* Left Column: Cart Items & Server Revalidation Alerts */}
                <div className="lg:col-span-7 space-y-4">
                  {/* Server Price-Change Warning Banner */}
                  {(revalidation?.requires_price_approval || revalidation?.has_price_changes) && !priceChangeApproved && (
                    <div
                      data-testid="price-change-banner"
                      role="alert"
                      className="p-4 rounded-2xl border border-amber-400/60 bg-amber-950/40 text-amber-100 space-y-3"
                    >
                      <p className="text-sm font-semibold">{t.priceChangeWarning}</p>
                      <button
                        type="button"
                        data-testid="approve-price-change-btn"
                        onClick={approveServerPriceChanges}
                        className="px-4 py-2 rounded-lg bg-amber-500 text-black font-bold text-xs"
                      >
                        {t.approvePriceChangeBtn}
                      </button>
                    </div>
                  )}

                  {/* Unavailable Items Warning Banner */}
                  {revalidation?.has_unavailable_items && (
                    <div
                      data-testid="unavailable-items-banner"
                      role="alert"
                      className="p-4 rounded-2xl border border-rose-500/60 bg-rose-950/40 text-rose-100 flex flex-wrap items-center justify-between gap-3"
                    >
                      <span className="text-sm font-semibold">
                        {lang === 'ar'
                          ? 'بعض المنتجات في السلة لم تعد متوفرة بالكمية المطلوبة.'
                          : 'One or more items in your cart are no longer available in the requested quantity.'}
                      </span>
                      <button
                        type="button"
                        data-testid="remove-unavailable-btn"
                        onClick={removeUnavailableCartItems}
                        className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-xs"
                      >
                        {t.removeUnavailableBtn}
                      </button>
                    </div>
                  )}

                  {/* Cart Item Rows */}
                  {cart.map((item, idx) => {
                    const revLine = revalidation?.items?.find(
                      (r) => r.product_id === item.product_id && (r.variant_id || null) === (item.variant_id || null)
                    );
                    const srvUnitPrice = revLine?.unit_price_ils ?? revLine?.server_unit_price_ils;
                    const effectiveUnitIls =
                      revLine && typeof srvUnitPrice === 'number' && priceChangeApproved
                        ? srvUnitPrice
                        : item.client_unit_price_ils;

                    return (
                      <div
                        key={`${item.product_id}-${item.variant_id || 'base'}`}
                        data-testid={`cart-item-row-${idx}`}
                        className="p-4 rounded-2xl border border-white/10 bg-[#0E1326] flex flex-wrap items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <h3 className="font-bold text-base">
                            {lang === 'ar' ? item.name_ar : item.name_en}
                            {(item.variant_name_ar || item.variant_name_en) && (
                              <span className="text-xs text-[#21D4FD] ms-2">
                                ({lang === 'ar' ? item.variant_name_ar : item.variant_name_en})
                              </span>
                            )}
                          </h3>
                          <div className="text-xs text-slate-400 flex items-center gap-3">
                            <bdi dir="ltr">{item.sku}</bdi>
                            <span>•</span>
                            <bdi dir="ltr">{formatCurrencyILS(effectiveUnitIls)}</bdi>
                            {revLine?.price_changed && (
                              <span className="text-amber-400 font-semibold">
                                ({lang === 'ar' ? 'السعر المحدث:' : 'Server price:'}{' '}
                                <bdi dir="ltr">{formatCurrencyILS(revLine.unit_price_ils ?? revLine.server_unit_price_ils ?? effectiveUnitIls)}</bdi>)
                              </span>
                            )}
                            {revLine && !revLine.is_available && (
                              <span className="text-rose-400 font-bold">{t.unavailableBadge}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center border border-white/15 rounded-xl bg-black/30">
                            <button
                              type="button"
                              data-testid={`cart-dec-${idx}`}
                              onClick={() => updateCartItemQuantity(idx, item.quantity - 1)}
                              className="px-2.5 py-1 text-sm font-bold"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              data-testid={`cart-qty-${idx}`}
                              min={1}
                              max={99}
                              value={item.quantity}
                              onChange={(e) => updateCartItemQuantity(idx, parseInt(e.target.value || '1', 10))}
                              aria-label="Item quantity"
                              className="w-12 text-center bg-transparent text-sm font-bold py-1"
                            />
                            <button
                              type="button"
                              data-testid={`cart-inc-${idx}`}
                              onClick={() => updateCartItemQuantity(idx, item.quantity + 1)}
                              className="px-2.5 py-1 text-sm font-bold"
                            >
                              +
                            </button>
                          </div>

                          <bdi dir="ltr" className="font-bold text-[#21D4FD] min-w-[80px] text-end">
                            {formatCurrencyILS(effectiveUnitIls * item.quantity)}
                          </bdi>

                          <button
                            type="button"
                            data-testid={`cart-remove-${idx}`}
                            onClick={() => removeCartItem(idx)}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/40 text-xs font-semibold"
                          >
                            {lang === 'ar' ? 'حذف' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Cart Summary Card */}
                  <div className="p-5 rounded-2xl border border-[#7C5CFC]/30 bg-[#0E1326] space-y-2">
                    <div className="flex items-center justify-between text-lg font-extrabold">
                      <span>{lang === 'ar' ? 'الإجمالي بالشيكل (ILS):' : 'Order Total (ILS):'}</span>
                      <bdi dir="ltr" data-testid="cart-total-ils" className="text-[#21D4FD]">
                        {formatCurrencyILS(cartSubtotalIls)}
                      </bdi>
                    </div>
                    {usdtRateInfo && usdtRateInfo.ils_per_usdt_rate > 0 && (
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>
                          {lang === 'ar'
                            ? `المعادل التقريبي بعملة USDT (بسعر ${usdtRateInfo.ils_per_usdt_rate} ₪/USDT):`
                            : `Estimated USDT Total (@ ${usdtRateInfo.ils_per_usdt_rate} ILS/USDT):`}
                        </span>
                        <bdi dir="ltr" data-testid="cart-total-usdt">
                          {formatCurrencyUSDT(cartSubtotalIls / usdtRateInfo.ils_per_usdt_rate)}
                        </bdi>
                      </div>
                    )}
                    <p className="text-xs text-slate-400 pt-1">{t.paymentDeadlineNotice}</p>
                  </div>
                </div>

                {/* Right Column: Step 1 (WhatsApp Verification) & Step 2 (Payment Method & Order Creation) */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Step 1: Mandatory WhatsApp Verification */}
                  <div className="p-6 rounded-2xl border border-[#7C5CFC]/40 bg-[#0E1326] space-y-4">
                    <h2 className="text-lg font-bold text-[#21D4FD]">{t.whatsappVerifyTitle}</h2>
                    <ul className="text-xs text-slate-300 space-y-1">
                      <li>{t.whatsappVerifyStep1}</li>
                      <li>{t.whatsappVerifyStep2}</li>
                      <li>{t.whatsappVerifyStep3}</li>
                    </ul>

                    <form onSubmit={handleRequestWhatsAppVerification} className="space-y-3">
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">{t.customerNameLabel}</label>
                        <input
                          type="text"
                          required
                          data-testid="wa-customer-name"
                          value={waCustomerName}
                          onChange={(e) => setWaCustomerName(e.target.value)}
                          placeholder={lang === 'ar' ? 'أحمد منصور' : 'Ahmad Mansour'}
                          className="w-full px-3.5 py-2 rounded-xl bg-[#080B16] border border-white/15 text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-slate-300 mb-1">{t.countryCodeLabel}</label>
                          <select
                            data-testid="wa-country-code"
                            value={waCountryCode}
                            onChange={(e) => setWaCountryCode(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-[#080B16] border border-white/15 text-sm"
                          >
                            <option value="+970">+970</option>
                            <option value="+972">+972</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-slate-300 mb-1">{t.whatsappDigitsLabel}</label>
                          <input
                            type="tel"
                            required
                            dir="ltr"
                            data-testid="wa-local-digits"
                            value={waLocalDigits}
                            onChange={(e) => setWaLocalDigits(e.target.value)}
                            placeholder="599112233"
                            className="w-full px-3.5 py-2 rounded-xl bg-[#080B16] border border-white/15 text-sm"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        data-testid="request-whatsapp-btn"
                        disabled={waBusy}
                        className="w-full py-2.5 rounded-xl bg-[#7C5CFC] text-white font-bold text-xs"
                      >
                        {waBusy ? '...' : t.requestVerificationBtn}
                      </button>
                    </form>

                    {waError && (
                      <p role="alert" className="text-xs text-rose-400 font-semibold">
                        {waError}
                      </p>
                    )}

                    {verification && (
                      <div
                        data-testid="wa-verification-status-box"
                        className="p-4 rounded-xl bg-black/40 border border-white/15 space-y-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">
                            {lang === 'ar' ? 'رمز التحقق:' : 'Verification Code:'}{' '}
                            <bdi dir="ltr" className="text-white font-mono font-bold">
                              {verification.verification_code}
                            </bdi>
                          </span>
                          <span
                            data-testid="wa-status-badge"
                            className={`px-2.5 py-0.5 rounded-full font-bold ${
                              verification.status === 'APPROVED'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : verification.status === 'REJECTED'
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {verification.status}
                          </span>
                        </div>

                        {verification.status === 'REJECTED' && verification.rejection_reason && (
                          <p className="text-rose-400">{verification.rejection_reason}</p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            data-testid="open-whatsapp-btn"
                            onClick={handleOpenWhatsAppLink}
                            className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 text-white font-bold"
                          >
                            {t.openWhatsappBtn}
                          </button>
                          <button
                            type="button"
                            data-testid="check-whatsapp-status-btn"
                            onClick={() => handleCheckVerificationStatus()}
                            className="py-2 px-3 rounded-lg border border-[#21D4FD] text-[#21D4FD] font-bold"
                          >
                            {t.checkStatusBtn}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 2: Payment Method & Order Creation */}
                  <div className="p-6 rounded-2xl border border-white/15 bg-[#0E1326] space-y-4">
                    <h2 className="text-lg font-bold">{t.paymentMethodTitle}</h2>

                    <div className="space-y-2.5">
                      <label
                        data-testid="pay-method-reflect"
                        onClick={() => setPaymentMethod('reflect_ils')}
                        className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer ${
                          paymentMethod === 'reflect_ils'
                            ? 'border-[#21D4FD] bg-[#7C5CFC]/20'
                            : 'border-white/15 bg-black/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="payment_method"
                            checked={paymentMethod === 'reflect_ils'}
                            onChange={() => setPaymentMethod('reflect_ils')}
                          />
                          <span className="font-bold text-sm">{t.reflectMethodLabel}</span>
                        </div>
                        <img src="/assets/reflect-logo.png" alt="Reflect" className="w-7 h-7 rounded object-cover" />
                      </label>

                      <label
                        data-testid="pay-method-binance"
                        onClick={() => {
                          if (storeSettings?.payment_methods?.binance_usdt?.enabled !== false) {
                            setPaymentMethod('binance_usdt');
                          }
                        }}
                        className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer ${
                          paymentMethod === 'binance_usdt'
                            ? 'border-[#21D4FD] bg-[#7C5CFC]/20'
                            : 'border-white/15 bg-black/30'
                        } ${storeSettings?.payment_methods?.binance_usdt?.enabled === false ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="payment_method"
                            disabled={storeSettings?.payment_methods?.binance_usdt?.enabled === false}
                            checked={paymentMethod === 'binance_usdt'}
                            onChange={() => setPaymentMethod('binance_usdt')}
                          />
                          <div>
                            <span className="font-bold text-sm block">{t.binanceMethodLabel}</span>
                            {storeSettings?.payment_methods?.binance_usdt?.enabled === false && (
                              <span className="text-[11px] text-amber-400">
                                {lang === 'ar'
                                  ? 'الدفع عبر USDT متوقف مؤقتاً لعدم توفر مزود سعر الصرف الفوري.'
                                  : 'Binance USDT temporarily disabled due to exchange-rate feed unavailability.'}
                              </span>
                            )}
                          </div>
                        </div>
                        <img src="/assets/binance-logo.png" alt="Binance" className="w-7 h-7 rounded object-cover" />
                      </label>
                    </div>

                    {checkoutError && (
                      <div
                        data-testid="checkout-error-box"
                        role="alert"
                        className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200"
                      >
                        {checkoutError}
                      </div>
                    )}

                    <button
                      type="button"
                      data-testid="create-order-btn"
                      disabled={checkoutBusy || verification?.status !== 'APPROVED'}
                      onClick={handleCreateOrder}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#7C5CFC] to-[#21D4FD] text-white font-extrabold text-sm disabled:opacity-40"
                    >
                      {checkoutBusy ? '...' : t.createOrderBtn}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* =====================================================================
            5. ORDER CONFIRMATION, PAYMENT INSTRUCTIONS & PRIVATE ORDER TRACKING
           ===================================================================== */}
        {route === 'track' && (
          <section data-testid="tracking-view" className="space-y-8 max-w-4xl mx-auto">
            <h1 className="text-2xl md:text-3xl font-extrabold">{t.trackingTitle}</h1>

            {/* Token Lookup Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                loadOrderTracking(trackingTokenInput);
              }}
              className="flex flex-col sm:flex-row gap-3"
            >
              <input
                type="text"
                dir="ltr"
                data-testid="tracking-token-input"
                value={trackingTokenInput}
                onChange={(e) => setTrackingTokenInput(e.target.value)}
                placeholder={t.trackingTokenPlaceholder}
                className="flex-1 px-4 py-3 rounded-xl bg-[#0E1326] border border-white/15 text-sm font-mono"
              />
              <button
                type="submit"
                data-testid="load-tracking-btn"
                disabled={trackingLoading}
                className="px-6 py-3 rounded-xl bg-[#7C5CFC] text-white font-bold text-sm"
              >
                {trackingLoading ? '...' : t.loadTrackingBtn}
              </button>
            </form>

            {trackingError && (
              <div
                data-testid="tracking-error-box"
                role="alert"
                className="p-5 rounded-2xl border border-rose-500/40 bg-rose-950/30 text-rose-200 text-sm"
              >
                {trackingError}
              </div>
            )}

            {trackingData && (
              <div data-testid="tracking-order-card" className="space-y-6">
                {/* Order Summary Header */}
                <div className="p-6 rounded-2xl border border-[#7C5CFC]/40 bg-[#0E1326] space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <span className="text-xs text-slate-400 block">
                        {lang === 'ar' ? 'رقم الطلب الرسمي' : 'Official Order Number'}
                      </span>
                      <div className="flex items-center gap-3 mt-1">
                        <bdi
                          dir="ltr"
                          data-testid="tracked-order-number"
                          className="text-2xl font-extrabold text-[#21D4FD] font-mono"
                        >
                          {trackingData.order_number}
                        </bdi>
                        <button
                          type="button"
                          data-testid="copy-order-number-btn"
                          onClick={handleCopyOrderNumber}
                          className="px-3 py-1 rounded-lg border border-white/20 hover:border-[#21D4FD] text-xs font-semibold"
                        >
                          {copyOrderFeedback
                            ? lang === 'ar'
                              ? 'تم النسخ ✓'
                              : 'Copied ✓'
                            : t.copyOrderNumberBtn}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span
                        data-testid="tracked-order-status"
                        className="px-3 py-1 rounded-full bg-[#7C5CFC]/25 border border-[#7C5CFC] text-xs font-bold"
                      >
                        {trackingData.status_label?.[lang] || trackingData.status}
                      </span>
                      <span
                        data-testid="tracked-payment-status"
                        className="px-3 py-1 rounded-full bg-[#21D4FD]/20 border border-[#21D4FD]/50 text-[#21D4FD] text-xs font-bold"
                      >
                        {trackingData.payment_status_label?.[lang] || trackingData.payment_status}
                      </span>
                    </div>
                  </div>

                  {/* 20-Minute Countdown Timer */}
                  {trackingData.status === 'AWAITING_PAYMENT_REPORT' && countdownSeconds !== null && (
                    <div
                      data-testid="payment-countdown"
                      className="p-4 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-between"
                    >
                      <span className="text-xs font-semibold text-amber-200">
                        {lang === 'ar'
                          ? 'المهلة المتبقية لإرسال إشعار الدفع (20 دقيقة):'
                          : 'Remaining time to submit payment transfer report (20m window):'}
                      </span>
                      <bdi dir="ltr" className="text-lg font-mono font-extrabold text-amber-300">
                        {Math.floor(countdownSeconds / 60)
                          .toString()
                          .padStart(2, '0')}
                        :
                        {(countdownSeconds % 60).toString().padStart(2, '0')}
                      </bdi>
                    </div>
                  )}

                  {/* Totals & Frozen USDT Rate Snapshot */}
                  <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-white/10 text-sm">
                    <div>
                      <span className="text-slate-400 text-xs block">
                        {lang === 'ar' ? 'الإجمالي بالشيكل (₪):' : 'Order Total (ILS):'}
                      </span>
                      <bdi dir="ltr" className="font-extrabold text-lg">
                        {formatCurrencyILS(trackingData.total_ils)}
                      </bdi>
                    </div>
                    {trackingData.usdt_payment_snapshot && (
                      <div>
                        <span className="text-slate-400 text-xs block">
                          {lang === 'ar' ? 'المبلغ المجمد المطلوب بـ USDT:' : 'Frozen Required USDT Amount:'}
                        </span>
                        <bdi
                          dir="ltr"
                          data-testid="tracked-frozen-usdt"
                          className="font-extrabold text-lg text-[#21D4FD]"
                        >
                          {formatCurrencyUSDT(trackingData.usdt_payment_snapshot.required_usdt_amount)}
                        </bdi>
                        <span className="text-[11px] text-slate-400 block">
                          (1 USDT = <bdi dir="ltr">{trackingData.usdt_payment_snapshot.ils_per_usdt_rate}</bdi> ILS)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment Instructions & Report Submission Form */}
                <div className="p-6 rounded-2xl border border-white/15 bg-[#0E1326] space-y-4">
                  <h2 className="text-lg font-bold text-[#21D4FD]">
                    {trackingData.payment_method === 'binance_usdt'
                      ? lang === 'ar'
                        ? 'تعليمات الدفع عبر محفظة بينانس (Binance USDT)'
                        : 'Binance USDT Payment Instructions'
                      : lang === 'ar'
                      ? 'تعليمات الدفع عبر تطبيق ريفلكت (Reflect ILS)'
                      : 'Reflect ILS Payment Instructions'}
                  </h2>

                  {trackingData.payment_method === 'binance_usdt' ? (
                    <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-xs space-y-2">
                      <div>
                        <span className="text-slate-400">Binance Pay ID: </span>
                        <bdi dir="ltr" className="font-mono font-bold text-white">
                          {storeSettings?.payment_methods?.binance_usdt?.pay_id || 'ORBIXA-BINANCE-PAY-889900'}
                        </bdi>
                      </div>
                      <div>
                        <span className="text-slate-400">TRC20 Wallet: </span>
                        <bdi dir="ltr" className="font-mono font-bold text-[#21D4FD]">
                          {storeSettings?.payment_methods?.binance_usdt?.wallet_address ||
                            'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'}
                        </bdi>
                      </div>
                      <p className="text-slate-300">
                        {lang === 'ar'
                          ? storeSettings?.payment_methods?.binance_usdt?.instructions_ar
                          : storeSettings?.payment_methods?.binance_usdt?.instructions_en}
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-xs space-y-2">
                      <div>
                        <span className="text-slate-400">Reflect Identifier: </span>
                        <bdi dir="ltr" className="font-mono font-bold text-[#21D4FD]">
                          {storeSettings?.payment_methods?.reflect_ils?.identifier || '059-000-0000 (Orbixa Digital)'}
                        </bdi>
                      </div>
                      <p className="text-slate-300">
                        {lang === 'ar'
                          ? storeSettings?.payment_methods?.reflect_ils?.instructions_ar
                          : storeSettings?.payment_methods?.reflect_ils?.instructions_en}
                      </p>
                    </div>
                  )}

                  {/* Submit Payment Report Form */}
                  <form onSubmit={handleSubmitPaymentReport} className="space-y-3 pt-2">
                    {trackingData.payment_method === 'binance_usdt' ? (
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">
                          {lang === 'ar'
                            ? 'رقم عملية التحويل (Binance Transaction ID / Reference)'
                            : 'Binance Transaction Reference / Order ID'}
                        </label>
                        <input
                          type="text"
                          required
                          dir="ltr"
                          data-testid="payment-txref-input"
                          value={reportTxRef}
                          onChange={(e) => setReportTxRef(e.target.value)}
                          placeholder="TX-99887766"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#080B16] border border-white/15 text-sm font-mono"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs text-slate-300 mb-1">
                          {lang === 'ar'
                            ? 'اسم صاحب حساب ريفلكت المحوِّل بالكامل'
                            : 'Sender Reflect Account Holder Full Name'}
                        </label>
                        <input
                          type="text"
                          required
                          data-testid="payment-holder-input"
                          value={reportHolderName}
                          onChange={(e) => setReportHolderName(e.target.value)}
                          placeholder={lang === 'ar' ? 'أحمد منصور' : 'Ahmad Mansour'}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#080B16] border border-white/15 text-sm"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs text-slate-300 mb-1">
                        {lang === 'ar' ? 'ملاحظة إضافية (اختياري)' : 'Additional Note (Optional)'}
                      </label>
                      <input
                        type="text"
                        data-testid="payment-note-input"
                        value={reportNote}
                        onChange={(e) => setReportNote(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-[#080B16] border border-white/15 text-sm"
                      />
                    </div>

                    <button
                      type="submit"
                      data-testid="submit-payment-report-btn"
                      disabled={reportSubmitting}
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#7C5CFC] to-[#21D4FD] text-white font-bold text-sm"
                    >
                      {reportSubmitting ? '...' : t.submitPaymentReportBtn}
                    </button>
                  </form>

                  {reportFeedback && (
                    <div
                      data-testid="payment-report-feedback"
                      role="status"
                      className={`p-3.5 rounded-xl text-xs font-semibold ${
                        reportFeedback.type === 'success'
                          ? 'bg-emerald-950/50 border border-emerald-500/40 text-emerald-200'
                          : 'bg-rose-950/50 border border-rose-500/40 text-rose-200'
                      }`}
                    >
                      {reportFeedback.message}
                    </div>
                  )}
                </div>

                {/* Items Summary & Milestones Timeline */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="p-5 rounded-2xl border border-white/10 bg-[#0E1326] space-y-3">
                    <h3 className="font-bold text-sm text-[#21D4FD]">
                      {lang === 'ar' ? 'ملخص المنتجات المحجوزة' : 'Reserved Order Items'}
                    </h3>
                    <ul className="space-y-2 text-xs">
                      {(trackingData.items_summary || []).map((it, idx) => (
                        <li key={idx} className="flex items-center justify-between py-1.5 border-b border-white/5">
                          <span>
                            {lang === 'ar' ? it.name_ar : it.name_en} × <bdi dir="ltr">{it.quantity}</bdi>
                          </span>
                          <bdi dir="ltr" className="font-bold">
                            {formatCurrencyILS(it.line_total_ils)}
                          </bdi>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-5 rounded-2xl border border-white/10 bg-[#0E1326] space-y-3">
                    <h3 className="font-bold text-sm text-[#21D4FD]">
                      {lang === 'ar' ? 'سجل مراحل الطلب' : 'Order Status Milestones'}
                    </h3>
                    <ul className="space-y-2 text-xs">
                      {(trackingData.milestones || []).map((m, idx) => (
                        <li key={idx} className="p-2 rounded-lg bg-black/30 border border-white/5">
                          <div className="font-bold">{lang === 'ar' ? m.label_ar : m.label_en}</div>
                          <div className="text-[11px] text-slate-400">
                            <bdi dir="ltr">{m.timestamp}</bdi>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Post-Order WhatsApp Change Request & Support Link */}
                <div className="p-5 rounded-2xl border border-white/10 bg-[#0E1326] grid md:grid-cols-2 gap-6 items-center">
                  <form onSubmit={handleRequestPostOrderWhatsAppChange} className="space-y-2">
                    <h3 className="font-bold text-sm">
                      {lang === 'ar'
                        ? 'طلب تحديث رقم واتساب المرتبط بالطلب'
                        : 'Request WhatsApp Contact Number Change'}
                    </h3>
                    <div className="flex gap-2">
                      <select
                        value={newWaCountryCode}
                        onChange={(e) => setNewWaCountryCode(e.target.value)}
                        className="px-2.5 py-2 rounded-lg bg-[#080B16] border border-white/15 text-xs"
                      >
                        <option value="+970">+970</option>
                        <option value="+972">+972</option>
                      </select>
                      <input
                        type="tel"
                        required
                        dir="ltr"
                        data-testid="post-order-wa-digits"
                        value={newWaDigits}
                        onChange={(e) => setNewWaDigits(e.target.value)}
                        placeholder="597778899"
                        className="flex-1 px-3 py-2 rounded-lg bg-[#080B16] border border-white/15 text-xs"
                      />
                      <button
                        type="submit"
                        data-testid="post-order-wa-submit"
                        className="px-3.5 py-2 rounded-lg bg-[#7C5CFC] text-white text-xs font-bold"
                      >
                        {lang === 'ar' ? 'تحديث' : 'Request'}
                      </button>
                    </div>
                    {newWaFeedback && <p className="text-xs text-emerald-400">{newWaFeedback}</p>}
                  </form>

                  <div className="text-end">
                    <a
                      href={trackingData.support_whatsapp_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                    >
                      {lang === 'ar' ? 'تواصل مع دعم المتجر عبر واتساب' : 'Contact Store Support via WhatsApp'}
                    </a>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* =====================================================================
            6. ABOUT, CONTACT, FAQ & POLICIES VIEWS
           ===================================================================== */}
        {route === 'about' && (
          <section data-testid="about-view" className="max-w-3xl mx-auto p-8 rounded-3xl border border-white/15 bg-[#0E1326] space-y-4">
            <h1 className="text-3xl font-extrabold text-[#21D4FD]">
              {activeCmsData?.about?.[lang]?.title || (lang === 'ar' ? 'عن متجر أوربيكسا' : 'About Orbixa Store')}
            </h1>
            <p className="text-slate-200 leading-relaxed">
              {activeCmsData?.about?.[lang]?.content ||
                (lang === 'ar'
                  ? 'متجر أوربيكسا هو منصة متخصصة في التجارة الرقمية توفر الاشتراكات الأصلية، أدوات الذكاء الاصطناعي، الأكواد الرقمية، والخدمات الرقمية الاحترافية بأعلى معايير الأمان والموثوقية.'
                  : 'Orbixa Store is a specialized digital-commerce platform providing authentic software subscriptions, AI tools, digital activation codes, and professional digital services tailored for reliability and security.')}
            </p>
          </section>
        )}

        {route === 'contact' && (
          <section data-testid="contact-view" className="max-w-3xl mx-auto p-8 rounded-3xl border border-white/15 bg-[#0E1326] space-y-4">
            <h1 className="text-3xl font-extrabold text-[#21D4FD]">
              {activeCmsData?.contact?.[lang]?.title ||
                (lang === 'ar' ? 'تواصل معنا والدعم الفني' : 'Contact & Customer Support')}
            </h1>
            <p className="text-slate-200">
              {activeCmsData?.contact?.[lang]?.subtitle ||
                (lang === 'ar'
                  ? 'يقوم فريقنا بمراجعة الدفعات وتسليم الطلبات الرقمية مباشرة عبر واتساب الرسمي للمتجر.'
                  : 'Our team verifies payments and delivers digital orders directly via official WhatsApp.')}
            </p>
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-sm space-y-2">
              <div>
                <strong>{lang === 'ar' ? 'ساعات العمل:' : 'Working Hours:'} </strong>
                <span>{activeCmsData?.contact?.[lang]?.working_hours || '09:00 AM – 11:00 PM'}</span>
              </div>
              <div>
                <strong>{lang === 'ar' ? 'واتساب الرسمي:' : 'Official WhatsApp:'} </strong>
                <bdi dir="ltr" className="text-[#21D4FD] font-mono">
                  +{storeSettings?.store_whatsapp_number || '970590000000'}
                </bdi>
              </div>
            </div>
          </section>
        )}

        {route === 'faq' && (
          <section data-testid="faq-view" className="max-w-3xl mx-auto space-y-4">
            <h1 className="text-3xl font-extrabold text-[#21D4FD] mb-4">{t.navFaq}</h1>
            {(activeCmsData?.faq?.[lang] || []).map((item, idx) => (
              <div key={idx} className="p-5 rounded-2xl border border-white/10 bg-[#0E1326] space-y-2">
                <h2 className="font-bold text-base text-white">{item.q}</h2>
                <p className="text-sm text-slate-300">{item.a}</p>
              </div>
            ))}
          </section>
        )}

        {route === 'policies' && (
          <section data-testid="policies-view" className="max-w-3xl mx-auto p-8 rounded-3xl border border-white/15 bg-[#0E1326] space-y-6">
            <h1 className="text-3xl font-extrabold text-[#21D4FD]">
              {activeCmsData?.policies?.[lang]?.title || t.navPolicies}
            </h1>
            <div className="space-y-2">
              <h2 className="text-lg font-bold">{lang === 'ar' ? 'شروط الخدمة والمهلة' : 'Terms of Service & Deadline'}</h2>
              <p className="text-sm text-slate-300">{activeCmsData?.policies?.[lang]?.terms}</p>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold">
                {lang === 'ar' ? 'سياسة عدم الاسترجاع للمنتجات الرقمية' : 'Digital Fulfillment & Non-Refund Policy'}
              </h2>
              <p className="text-sm text-slate-300">{activeCmsData?.policies?.[lang]?.non_refund_policy}</p>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold">{lang === 'ar' ? 'سياسة الخصوصية والاحتفاظ بالبيانات' : 'Privacy & Data Retention Policy'}</h2>
              <p className="text-sm text-slate-300">{activeCmsData?.policies?.[lang]?.privacy_policy}</p>
            </div>
          </section>
        )}

        {/* =====================================================================
            7. ADMIN LOGIN VIEW (`route === 'login'` or unauthenticated `route === 'admin'`)
           ===================================================================== */}
        {(route === 'login' || (route === 'admin' && !adminUser)) && (
          <section
            data-testid="admin-login-view"
            className="max-w-md mx-auto p-8 rounded-3xl border border-[#7C5CFC]/40 bg-[#0E1326] space-y-5"
          >
            <h1 className="text-2xl font-extrabold text-center text-[#21D4FD]">{t.adminLoginTitle}</h1>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  {lang === 'ar' ? 'اسم مستخدم المدير' : 'Administrator Username'}
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  data-testid="admin-username-input"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#080B16] border border-white/15 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  {lang === 'ar' ? 'كلمة المرور' : 'Password'}
                </label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  data-testid="admin-password-input"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#080B16] border border-white/15 text-sm"
                />
              </div>
              {loginError && (
                <div
                  data-testid="admin-login-error"
                  role="alert"
                  className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200"
                >
                  {loginError}
                </div>
              )}
              <button
                type="submit"
                data-testid="admin-login-submit"
                disabled={loginBusy}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#7C5CFC] to-[#21D4FD] text-white font-bold text-sm"
              >
                {loginBusy ? '...' : lang === 'ar' ? 'تسجيل الدخول الآمن' : 'Sign In to Admin Console'}
              </button>
            </form>
          </section>
        )}

        {/* =====================================================================
            8. PROTECTED ADMIN DASHBOARD (`route === 'admin' && adminUser`)
           ===================================================================== */}
        {route === 'admin' && adminUser && (
          <section data-testid="admin-dashboard-view" className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl border border-[#7C5CFC]/40 bg-[#0E1326]">
              <div>
                <h1 className="text-2xl font-extrabold text-[#21D4FD]">
                  {lang === 'ar' ? 'لوحة تحكم وإدارة متجر أوربيكسا' : 'Orbixa Store Administration Console'}
                </h1>
                <p className="text-xs text-slate-400">
                  {lang === 'ar' ? 'المسؤول المتصل:' : 'Authenticated Administrator:'}{' '}
                  <bdi dir="ltr" className="text-white font-bold">{adminUser}</bdi>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={refreshAdminData}
                  className="px-3.5 py-2 rounded-xl border border-[#21D4FD]/50 text-xs font-bold text-[#21D4FD]"
                >
                  {lang === 'ar' ? 'تحديث البيانات' : 'Refresh Data'}
                </button>
                <button
                  type="button"
                  data-testid="admin-logout-btn"
                  onClick={handleAdminLogout}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
                >
                  {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
                </button>
              </div>
            </div>

            {adminNotice && (
              <div
                data-testid="admin-notice-banner"
                role="status"
                className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between ${
                  adminNotice.type === 'success'
                    ? 'bg-emerald-950/50 border border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/50 border border-rose-500/40 text-rose-200'
                }`}
              >
                <span>{adminNotice.text}</span>
                <button type="button" onClick={() => setAdminNotice(null)} className="text-xs underline">
                  ×
                </button>
              </div>
            )}

            {/* Admin Navigation Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
              {[
                { id: 'overview', label: lang === 'ar' ? 'نظرة عامة والمالية' : 'Overview & Finance' },
                { id: 'whatsapp', label: 'تأكيد أرقام واتساب' },
                { id: 'orders', label: lang === 'ar' ? 'الطلبات والدفعات والتسليم' : 'Orders, Payments & Fulfillment' },
                { id: 'waiting', label: 'الطلبات المنتظرة' },
                { id: 'catalog', label: lang === 'ar' ? 'المنتجات والأقسام والمخزون' : 'Products, Categories & Stock' },
                { id: 'tasks', label: lang === 'ar' ? 'مركز المهام والدعم' : 'Task Center & Support' },
                { id: 'cms', label: lang === 'ar' ? 'المحتوى (CMS) والإعدادات' : 'CMS, Templates & Settings' },
                { id: 'reports', label: lang === 'ar' ? 'التقارير وسجلات التدقيق' : 'Reports & Audit Logs' },
              ].map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  data-testid={`admin-tab-${tb.id}`}
                  onClick={() => setAdminTab(tb.id as any)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold ${
                    adminTab === tb.id
                      ? 'bg-[#7C5CFC] text-white'
                      : 'bg-[#0E1326] text-slate-300 border border-white/10'
                  }`}
                >
                  {tb.label}
                </button>
              ))}
            </div>

            {/* TAB 1: OVERVIEW & FINANCIAL SEPARATION */}
            {adminTab === 'overview' && adminMetrics && (
              <div data-testid="admin-panel-overview" className="space-y-6">
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl border border-white/10 bg-[#0E1326]">
                    <span className="text-xs text-slate-400 block">
                      {lang === 'ar' ? 'إجمالي المقبوضات الموثقة (₪)' : 'Verified Receipts (ILS)'}
                    </span>
                    <bdi dir="ltr" className="text-xl font-extrabold text-[#21D4FD]">
                      {formatCurrencyILS(adminMetrics.financial_summary?.verified_receipts_ils || 0)}
                    </bdi>
                  </div>
                  <div className="p-4 rounded-2xl border border-white/10 bg-[#0E1326]">
                    <span className="text-xs text-slate-400 block">
                      {lang === 'ar' ? 'إيرادات الطلبات المكتملة (₪)' : 'Completed Orders Revenue (ILS)'}
                    </span>
                    <bdi dir="ltr" className="text-xl font-extrabold text-emerald-400">
                      {formatCurrencyILS(adminMetrics.financial_summary?.revenue_completed_orders_ils || 0)}
                    </bdi>
                  </div>
                  <div className="p-4 rounded-2xl border border-white/10 bg-[#0E1326]">
                    <span className="text-xs text-slate-400 block">
                      {lang === 'ar' ? 'صافي الربح المحقق (₪)' : 'Realized Net Profit (ILS)'}
                    </span>
                    <bdi dir="ltr" className="text-xl font-extrabold text-white">
                      {formatCurrencyILS(adminMetrics.financial_summary?.realized_profit_completed_orders_ils || 0)}
                    </bdi>
                  </div>
                  <div className="p-4 rounded-2xl border border-white/10 bg-[#0E1326]">
                    <span className="text-xs text-slate-400 block">
                      {lang === 'ar' ? 'دفعات ناقصة / قيد المراجعة' : 'Underpaid / Discrepancy Orders'}
                    </span>
                    <bdi dir="ltr" className="text-xl font-extrabold text-amber-400">
                      {adminMetrics.financial_summary?.underpaid_orders_count || 0}
                    </bdi>
                  </div>
                </div>

                {/* Operational Action Controls */}
                <div className="p-5 rounded-2xl border border-white/10 bg-[#0E1326] flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await apiRequest<any>('/admin/backups/verify', { method: 'POST' });
                        setAdminNotice({
                          type: 'success',
                          text: `Backup verified: ${res.collections_verified?.length || 0} collections restored in isolated check.`,
                        });
                        refreshAdminData();
                      }}
                      className="px-4 py-2 rounded-xl bg-[#7C5CFC] text-white text-xs font-bold"
                    >
                      {lang === 'ar' ? 'فحص النسخ الاحتياطي والاستعادة المعزولة' : 'Verify Backup & Isolated Restore'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await apiRequest<any>('/admin/safe-mode/recover', {
                          method: 'POST',
                          body: JSON.stringify({ verification_note: 'Manual health verification from dashboard' }),
                        });
                        setAdminNotice({ type: 'success', text: res.message || 'Safe mode recovered.' });
                        loadStorefrontInit();
                        refreshAdminData();
                      }}
                      className="px-4 py-2 rounded-xl border border-emerald-400/50 text-emerald-300 text-xs font-bold"
                    >
                      {lang === 'ar' ? 'استعادة الوضع الطبيعي (Safe Mode)' : 'Recover Safe Mode'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await apiRequest<any>('/admin/retention/execute', { method: 'POST' });
                        setAdminNotice({
                          type: 'success',
                          text: `Retention executed: ${res.anonymized_orders_count || 0} expired PII records anonymized.`,
                        });
                      }}
                      className="px-4 py-2 rounded-xl border border-white/20 text-xs font-semibold"
                    >
                      {lang === 'ar' ? 'تشغيل سياسة الخصوصية وإخفاء البيانات' : 'Run PII Retention Policy'}
                    </button>
                  </div>
                </div>

                {/* Admin Password Change & Session Revocation */}
                <div className="p-5 rounded-2xl border border-white/10 bg-[#0E1326] grid md:grid-cols-2 gap-6">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await apiRequest('/admin/auth/change-password', {
                          method: 'POST',
                          body: JSON.stringify({
                            current_password: currentPasswordInput,
                            new_password: newPasswordInput,
                          }),
                        });
                        setCurrentPasswordInput('');
                        setNewPasswordInput('');
                        setAdminNotice({ type: 'success', text: 'Admin password updated and session version rotated.' });
                      } catch (err: any) {
                        setAdminNotice({ type: 'error', text: err?.message || 'Password change failed.' });
                      }
                    }}
                    className="space-y-2"
                  >
                    <h3 className="font-bold text-sm">
                      {lang === 'ar' ? 'تغيير كلمة مرور المدير' : 'Change Administrator Password'}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="password"
                        required
                        placeholder="Current password"
                        value={currentPasswordInput}
                        onChange={(e) => setCurrentPasswordInput(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-[#080B16] border border-white/15 text-xs"
                      />
                      <input
                        type="password"
                        required
                        placeholder="New password (min 10 chars)"
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-[#080B16] border border-white/15 text-xs"
                      />
                      <button type="submit" className="px-3.5 py-1.5 rounded-lg bg-[#7C5CFC] text-white text-xs font-bold">
                        {lang === 'ar' ? 'تحديث كلمة المرور' : 'Update Password'}
                      </button>
                    </div>
                  </form>

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest('/admin/auth/logout-all', { method: 'POST' });
                        setCsrfToken(null);
                        setAdminUser(null);
                        navigateTo('login');
                      }}
                      className="px-4 py-2 rounded-xl border border-rose-500/50 text-rose-300 text-xs font-bold"
                    >
                      {lang === 'ar' ? 'إنهاء جميع الجلسات النشطة فوراً' : 'Revoke All Active Admin Sessions'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: WHATSAPP VERIFICATIONS (`تأكيد أرقام واتساب`) */}
            {adminTab === 'whatsapp' && (
              <div data-testid="admin-panel-whatsapp" className="space-y-4">
                <h2 className="text-xl font-bold text-[#21D4FD]">تأكيد أرقام واتساب</h2>
                {adminVerifications.length === 0 ? (
                  <p className="text-sm text-slate-400">No WhatsApp verification requests yet.</p>
                ) : (
                  <div className="space-y-3">
                    {adminVerifications.map((wv) => (
                      <div
                        key={wv.verification_id}
                        data-testid={`admin-wa-row-${wv.verification_id}`}
                        className="p-4 rounded-2xl border border-white/10 bg-[#0E1326] flex flex-wrap items-center justify-between gap-4"
                      >
                        <div className="space-y-1 text-xs">
                          <div className="font-bold text-sm text-white">
                            {wv.customer_name} — <bdi dir="ltr" className="text-[#21D4FD]">{wv.display_phone}</bdi>
                          </div>
                          <div className="text-slate-400">
                            Code: <bdi dir="ltr" className="font-mono text-white font-bold">{wv.verification_code}</bdi>
                            {' • '}Status: <strong className="text-amber-300">{wv.status}</strong>
                            {wv.for_order_number && (
                              <span> • For Order: <bdi dir="ltr">{wv.for_order_number}</bdi></span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            data-testid={`admin-wa-approve-${wv.verification_id}`}
                            onClick={() => handleAdminReviewWhatsApp(wv.verification_id, 'APPROVE')}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                          >
                            {lang === 'ar' ? 'موافقة (APPROVE)' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            data-testid={`admin-wa-reject-${wv.verification_id}`}
                            onClick={() => handleAdminReviewWhatsApp(wv.verification_id, 'REJECT')}
                            className="px-3.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
                          >
                            {lang === 'ar' ? 'رفض (REJECT)' : 'Reject'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: ORDERS, MANUAL PAYMENT REVIEW & COMPLETE FULFILLMENT */}
            {adminTab === 'orders' && (
              <div data-testid="admin-panel-orders" className="space-y-4">
                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <input
                    type="search"
                    placeholder="Search order #, customer, or phone..."
                    value={adminOrderSearch}
                    onChange={(e) => setAdminOrderSearch(e.target.value)}
                    className="px-3.5 py-2 rounded-xl bg-[#0E1326] border border-white/15 text-xs min-w-[240px]"
                  />
                  <select
                    value={adminOrderFilterStatus}
                    onChange={(e) => setAdminOrderFilterStatus(e.target.value)}
                    className="px-3.5 py-2 rounded-xl bg-[#0E1326] border border-white/15 text-xs"
                  >
                    <option value="">All Statuses</option>
                    <option value="AWAITING_PAYMENT_REPORT">AWAITING_PAYMENT_REPORT</option>
                    <option value="PAYMENT_REPORTED_REVIEW">PAYMENT_REPORTED_REVIEW</option>
                    <option value="PAYMENT_DISCREPANCY_REVIEW">PAYMENT_DISCREPANCY_REVIEW</option>
                    <option value="PAYMENT_CONFIRMED">PAYMENT_CONFIRMED</option>
                    <option value="DELIVERY_FAILED">DELIVERY_FAILED (تعذّر التسليم — بانتظار معالجة)</option>
                    <option value="WAITING_FOR_AVAILABILITY">WAITING_FOR_AVAILABILITY (الطلبات المنتظرة)</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="CANCELLED_DEADLINE">CANCELLED_DEADLINE</option>
                    <option value="CANCELLED_ADMIN">CANCELLED_ADMIN</option>
                  </select>
                </div>

                {adminOrders.length === 0 ? (
                  <p className="text-sm text-slate-400">No orders found matching criteria.</p>
                ) : (
                  <div className="space-y-4">
                    {adminOrders.map((ord) => {
                      const expectedAmount =
                        ord.payment_method === 'binance_usdt'
                          ? ord.usdt_payment_snapshot?.required_usdt_amount || 0
                          : ord.total_ils;
                      return (
                        <div
                          key={ord.order_number}
                          data-testid={`admin-order-card-${ord.order_number}`}
                          className="p-5 rounded-2xl border border-white/15 bg-[#0E1326] space-y-4 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <bdi dir="ltr" className="text-base font-extrabold text-[#21D4FD] font-mono">
                                {ord.order_number}
                              </bdi>
                              <span className="ms-3 text-slate-300">
                                {ord.customer_snapshot?.customer_name} (
                                <bdi dir="ltr">{ord.active_whatsapp_phone}</bdi>)
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <span className="px-2.5 py-1 rounded-full bg-[#7C5CFC]/25 font-bold">
                                {ord.status}
                              </span>
                              <span className="px-2.5 py-1 rounded-full bg-[#21D4FD]/20 text-[#21D4FD] font-bold">
                                {ord.payment_status}
                              </span>
                            </div>
                          </div>

                          <div className="text-slate-300">
                            Method: <strong>{ord.payment_method}</strong> • Total ILS:{' '}
                            <bdi dir="ltr">{formatCurrencyILS(ord.total_ils)}</bdi>
                            {ord.usdt_payment_snapshot && (
                              <span>
                                {' '}
                                • Frozen USDT:{' '}
                                <bdi dir="ltr">
                                  {formatCurrencyUSDT(ord.usdt_payment_snapshot.required_usdt_amount)}
                                </bdi>
                              </span>
                            )}
                            {ord.duplicate_reference_flagged && (
                              <span className="ms-2 px-2 py-0.5 rounded bg-rose-600 text-white font-bold">
                                DUPLICATE PAYMENT REF FLAGGED
                              </span>
                            )}
                          </div>

                          {/* Payment Submissions List */}
                          {ord.payment_submissions && ord.payment_submissions.length > 0 && (
                            <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1">
                              <strong className="block text-slate-300">Customer Payment Reports:</strong>
                              {ord.payment_submissions.map((sub: any, sIdx: number) => (
                                <div key={sIdx}>
                                  Ref/Holder:{' '}
                                  <bdi dir="ltr" className="font-mono text-[#21D4FD]">
                                    {sub.transaction_reference || sub.account_holder_name}
                                  </bdi>{' '}
                                  at <bdi dir="ltr">{sub.submitted_at}</bdi>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Payment Review Controls */}
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                            <input
                              type="number"
                              step="0.01"
                              data-testid={`admin-verify-amt-${ord.order_number}`}
                              placeholder={`Verified Amt (${expectedAmount})`}
                              value={reviewAmounts[ord.order_number] ?? ''}
                              onChange={(e) =>
                                setReviewAmounts((prev) => ({ ...prev, [ord.order_number]: e.target.value }))
                              }
                              className="px-3 py-1.5 rounded-lg bg-[#080B16] border border-white/15 w-40"
                            />
                            <input
                              type="text"
                              data-testid={`admin-review-note-${ord.order_number}`}
                              placeholder="Review / Resolution / Reason note"
                              value={reviewNotes[ord.order_number] ?? ''}
                              onChange={(e) =>
                                setReviewNotes((prev) => ({ ...prev, [ord.order_number]: e.target.value }))
                              }
                              className="px-3 py-1.5 rounded-lg bg-[#080B16] border border-white/15 flex-1 min-w-[180px]"
                            />
                            <button
                              type="button"
                              data-testid={`admin-confirm-payment-${ord.order_number}`}
                              onClick={() => handleAdminReviewPayment(ord.order_number, 'CONFIRM', expectedAmount)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                            >
                              Confirm Payment
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdminReviewPayment(ord.order_number, 'MARK_UNDERPAID', expectedAmount)}
                              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold"
                            >
                              Mark Underpaid
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdminReviewPayment(ord.order_number, 'REJECT', 0)}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold"
                            >
                              Reject Payment
                            </button>
                          </div>

                          {/* Complete Fulfillment & Exception Controls */}
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                            <input
                              type="text"
                              data-testid={`admin-fulfill-code-${ord.order_number}`}
                              placeholder="Digital Code / Activation Key"
                              value={fulfillCodes[ord.order_number] ?? ''}
                              onChange={(e) =>
                                setFulfillCodes((prev) => ({ ...prev, [ord.order_number]: e.target.value }))
                              }
                              className="px-3 py-1.5 rounded-lg bg-[#080B16] border border-white/15 w-52 font-mono"
                            />
                            <input
                              type="text"
                              data-testid={`admin-fulfill-desc-${ord.order_number}`}
                              placeholder="Delivery description & instructions"
                              value={fulfillDescriptions[ord.order_number] ?? ''}
                              onChange={(e) =>
                                setFulfillDescriptions((prev) => ({ ...prev, [ord.order_number]: e.target.value }))
                              }
                              className="px-3 py-1.5 rounded-lg bg-[#080B16] border border-white/15 flex-1 min-w-[180px]"
                            />
                            <button
                              type="button"
                              data-testid={`admin-fulfill-btn-${ord.order_number}`}
                              onClick={() => handleAdminFulfillOrder(ord)}
                              className="px-3.5 py-1.5 rounded-lg bg-[#7C5CFC] text-white font-bold"
                            >
                              Fulfill Order Completely
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdminDeliveryFailed(ord.order_number)}
                              className="px-3 py-1.5 rounded-lg border border-amber-400/50 text-amber-300 font-semibold"
                            >
                              Mark Delivery Failed
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdminMoveToWaiting(ord.order_number)}
                              className="px-3 py-1.5 rounded-lg border border-[#21D4FD]/50 text-[#21D4FD] font-semibold"
                            >
                              Move to الطلبات المنتظرة
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: WAITING ORDERS (`الطلبات المنتظرة`) */}
            {adminTab === 'waiting' && (
              <div data-testid="admin-panel-waiting" className="space-y-4">
                <h2 className="text-xl font-bold text-[#21D4FD]">الطلبات المنتظرة (Waiting & Failed Deliveries)</h2>
                {adminOrders.filter((o) =>
                  ['WAITING_FOR_AVAILABILITY', 'DELIVERY_FAILED'].includes(o.status)
                ).length === 0 ? (
                  <p className="text-sm text-slate-400">No orders currently in الطلبات المنتظرة.</p>
                ) : (
                  adminOrders
                    .filter((o) => ['WAITING_FOR_AVAILABILITY', 'DELIVERY_FAILED'].includes(o.status))
                    .map((ord) => (
                      <div
                        key={ord.order_number}
                        className="p-5 rounded-2xl border border-[#21D4FD]/30 bg-[#0E1326] space-y-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <bdi dir="ltr" className="font-mono font-bold text-base text-[#21D4FD]">
                            {ord.order_number}
                          </bdi>
                          <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                            {ord.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <input
                            type="text"
                            placeholder="Custom available product name for WhatsApp message"
                            value={waitingCustomName[ord.order_number] ?? ''}
                            onChange={(e) =>
                              setWaitingCustomName((prev) => ({ ...prev, [ord.order_number]: e.target.value }))
                            }
                            className="px-3 py-1.5 rounded-lg bg-[#080B16] border border-white/15 flex-1"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleAdminPreviewWaitingAvailable(
                                ord.order_number,
                                ord.items?.[0]?.name_ar || 'المنتج الرقمي'
                              )
                            }
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                          >
                            Generate Availability WhatsApp Message
                          </button>
                        </div>
                        {waitingPreviewLink[ord.order_number] && (
                          <div className="p-2.5 rounded-lg bg-black/40 text-emerald-300 break-all">
                            {waitingPreviewLink[ord.order_number]}
                          </div>
                        )}
                      </div>
                    ))
                )}
              </div>
            )}

            {/* TAB 5: CATALOG (Products, Categories, Stock Reconciliation & CSV) */}
            {adminTab === 'catalog' && (
              <div data-testid="admin-panel-catalog" className="space-y-8">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Create Category Form */}
                  <form
                    onSubmit={handleAdminCreateCategory}
                    className="p-5 rounded-2xl border border-white/10 bg-[#0E1326] space-y-3 text-xs"
                  >
                    <h3 className="text-base font-bold text-[#21D4FD]">Create Category</h3>
                    <input
                      type="text"
                      required
                      data-testid="admin-cat-name-ar"
                      placeholder="Category Name (Arabic)"
                      value={newCatNameAr}
                      onChange={(e) => setNewCatNameAr(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                    />
                    <input
                      type="text"
                      required
                      data-testid="admin-cat-name-en"
                      placeholder="Category Name (English)"
                      value={newCatNameEn}
                      onChange={(e) => setNewCatNameEn(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                    />
                    <input
                      type="text"
                      data-testid="admin-cat-slug"
                      placeholder="Slug (e.g. ai-tools)"
                      value={newCatSlug}
                      onChange={(e) => setNewCatSlug(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                    />
                    <button
                      type="submit"
                      data-testid="admin-create-category-btn"
                      className="px-4 py-2 rounded-lg bg-[#7C5CFC] text-white font-bold"
                    >
                      Save Category
                    </button>
                  </form>

                  {/* Create Product Form */}
                  <form
                    onSubmit={handleAdminCreateProduct}
                    className="p-5 rounded-2xl border border-white/10 bg-[#0E1326] space-y-3 text-xs"
                  >
                    <h3 className="text-base font-bold text-[#21D4FD]">Create Product</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        required
                        data-testid="admin-prod-name-ar"
                        placeholder="Product Name (AR)"
                        value={newProdNameAr}
                        onChange={(e) => setNewProdNameAr(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                      />
                      <input
                        type="text"
                        required
                        data-testid="admin-prod-name-en"
                        placeholder="Product Name (EN)"
                        value={newProdNameEn}
                        onChange={(e) => setNewProdNameEn(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        data-testid="admin-prod-desc-ar"
                        placeholder="Description (AR)"
                        value={newProdDescAr}
                        onChange={(e) => setNewProdDescAr(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                      />
                      <input
                        type="text"
                        data-testid="admin-prod-desc-en"
                        placeholder="Description (EN)"
                        value={newProdDescEn}
                        onChange={(e) => setNewProdDescEn(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        data-testid="admin-prod-type"
                        value={newProdType}
                        onChange={(e) => setNewProdType(e.target.value as any)}
                        className="px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                      >
                        <option value="SUBSCRIPTION">SUBSCRIPTION</option>
                        <option value="DIGITAL_CODE">DIGITAL_CODE</option>
                        <option value="MANUAL_SERVICE">MANUAL_SERVICE</option>
                      </select>
                      <select
                        data-testid="admin-prod-category"
                        value={newProdCategoryId}
                        onChange={(e) => setNewProdCategoryId(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                      >
                        <option value="">No Category</option>
                        {adminCategories.map((c) => (
                          <option key={c.category_id} value={c.category_id}>
                            {c.name_en}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        required
                        data-testid="admin-prod-price"
                        placeholder="Price ILS"
                        value={newProdPriceIls}
                        onChange={(e) => setNewProdPriceIls(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="0.01"
                        data-testid="admin-prod-cost"
                        placeholder="Supplier Cost ILS"
                        value={newProdCostIls}
                        onChange={(e) => setNewProdCostIls(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                      />
                      <input
                        type="number"
                        required
                        data-testid="admin-prod-stock"
                        placeholder="Actual Stock"
                        value={newProdStock}
                        onChange={(e) => setNewProdStock(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                      />
                    </div>
                    {/* Optional Variant */}
                    <div className="grid grid-cols-4 gap-2 pt-1 border-t border-white/10">
                      <input
                        type="text"
                        data-testid="admin-var-name-ar"
                        placeholder="Variant AR (optional)"
                        value={newProdVariantNameAr}
                        onChange={(e) => setNewProdVariantNameAr(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#080B16] border border-white/15"
                      />
                      <input
                        type="text"
                        data-testid="admin-var-name-en"
                        placeholder="Variant EN (optional)"
                        value={newProdVariantNameEn}
                        onChange={(e) => setNewProdVariantNameEn(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#080B16] border border-white/15"
                      />
                      <input
                        type="number"
                        step="0.01"
                        data-testid="admin-var-price"
                        placeholder="Var Price ILS"
                        value={newProdVariantPrice}
                        onChange={(e) => setNewProdVariantPrice(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#080B16] border border-white/15"
                      />
                      <input
                        type="number"
                        data-testid="admin-var-stock"
                        placeholder="Var Stock"
                        value={newProdVariantStock}
                        onChange={(e) => setNewProdVariantStock(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#080B16] border border-white/15"
                      />
                    </div>
                    <button
                      type="submit"
                      data-testid="admin-create-product-btn"
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#7C5CFC] to-[#21D4FD] text-white font-bold"
                    >
                      Publish Product
                    </button>
                  </form>
                </div>

                {/* Product Inventory & Reconciliation Table */}
                <div className="space-y-3">
                  <h3 className="text-lg font-bold">Catalog Inventory & Stock Reconciliation</h3>
                  {adminProducts.map((p) => {
                    const recInput = reconcileInputs[p.product_id] || { stock: String(p.actual_stock ?? 0), reason: '' };
                    return (
                      <div
                        key={p.product_id}
                        className="p-4 rounded-2xl border border-white/10 bg-[#0E1326] flex flex-wrap items-center justify-between gap-4 text-xs"
                      >
                        <div>
                          <div className="font-bold text-sm">
                            {p.name_en} / {p.name_ar} (<bdi dir="ltr">{p.sku}</bdi>)
                          </div>
                          <div className="text-slate-400">
                            Price: <bdi dir="ltr">{formatCurrencyILS(p.price_ils)}</bdi> • Actual:{' '}
                            <strong>{p.actual_stock}</strong> • Reserved: <strong>{p.reserved_stock}</strong> •
                            Available: <strong className="text-emerald-400">{p.available_stock}</strong>
                            {p.sales_disabled_due_to_mismatch && (
                              <span className="ms-2 text-rose-400 font-bold">MISMATCH FLAGGED</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            value={recInput.stock}
                            onChange={(e) =>
                              setReconcileInputs((prev) => ({
                                ...prev,
                                [p.product_id]: { ...recInput, stock: e.target.value },
                              }))
                            }
                            className="w-20 px-2.5 py-1.5 rounded-lg bg-[#080B16] border border-white/15"
                          />
                          <input
                            type="text"
                            placeholder="Audit reconciliation reason"
                            value={recInput.reason}
                            onChange={(e) =>
                              setReconcileInputs((prev) => ({
                                ...prev,
                                [p.product_id]: { ...recInput, reason: e.target.value },
                              }))
                            }
                            className="w-48 px-2.5 py-1.5 rounded-lg bg-[#080B16] border border-white/15"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiRequest(`/admin/products/${encodeURIComponent(p.product_id)}/reconcile-stock`, {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    verified_actual_stock: parseInt(recInput.stock || '0', 10),
                                    reason: recInput.reason || 'Physical vault audit verified',
                                  }),
                                });
                                setAdminNotice({ type: 'success', text: `Stock reconciled for ${p.sku}.` });
                                refreshAdminData();
                                fetchProducts();
                              } catch (err: any) {
                                setAdminNotice({ type: 'error', text: err?.message || 'Reconciliation error.' });
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#21D4FD]/20 text-[#21D4FD] font-bold"
                          >
                            Reconcile
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/admin/products/${encodeURIComponent(p.product_id)}/flag-mismatch`, {
                                method: 'POST',
                                body: JSON.stringify({ reason: 'Manual discrepancy check triggered' }),
                              });
                              refreshAdminData();
                              fetchProducts();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-amber-600/30 text-amber-200 font-bold"
                          >
                            Flag Mismatch
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* CSV Import / Export */}
                <div className="p-5 rounded-2xl border border-white/10 bg-[#0E1326] space-y-3 text-xs">
                  <h3 className="font-bold text-sm text-[#21D4FD]">CSV Catalog Import & Formula-Safe Export</h3>
                  <textarea
                    rows={3}
                    placeholder="sku,name_ar,name_en,product_type,price_ils,actual_stock..."
                    value={csvImportText}
                    onChange={(e) => setCsvImportText(e.target.value)}
                    className="w-full p-3 rounded-xl bg-[#080B16] border border-white/15 font-mono"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await apiRequest<any>('/admin/products/import-csv', {
                            method: 'POST',
                            body: JSON.stringify({ csv_text: csvImportText }),
                          });
                          setAdminNotice({ type: 'success', text: `Imported ${res.imported_count} products.` });
                          refreshAdminData();
                          fetchProducts();
                        } catch (err: any) {
                          setAdminNotice({ type: 'error', text: err?.message || 'CSV import rejected.' });
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-[#7C5CFC] text-white font-bold"
                    >
                      Import CSV Batch
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: TASK CENTER & CUSTOMER SUPPORT RECORDS */}
            {adminTab === 'tasks' && (
              <div data-testid="admin-panel-tasks" className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-[#21D4FD]">Admin Task Center</h2>
                  <select
                    value={adminTaskFilter}
                    onChange={(e) => setAdminTaskFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-[#0E1326] border border-white/15 text-xs"
                  >
                    <option value="OPEN">OPEN TASKS</option>
                    <option value="CLOSED">CLOSED TASKS</option>
                  </select>
                </div>

                {adminTasks.map((tsk) => (
                  <div
                    key={tsk.task_id}
                    className="p-4 rounded-2xl border border-white/10 bg-[#0E1326] flex flex-wrap items-center justify-between gap-4 text-xs"
                  >
                    <div>
                      <div className="font-bold text-sm">
                        [{tsk.priority}] {tsk.title_en} — <bdi dir="ltr">{tsk.related_entity_id}</bdi>
                      </div>
                      <div className="text-slate-400">
                        Type: {tsk.task_type} • Status: {tsk.status}
                      </div>
                    </div>
                    {tsk.status === 'OPEN' ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Final outcome to close task"
                          value={taskOutcomeInputs[tsk.task_id] ?? ''}
                          onChange={(e) =>
                            setTaskOutcomeInputs((prev) => ({ ...prev, [tsk.task_id]: e.target.value }))
                          }
                          className="px-3 py-1.5 rounded-lg bg-[#080B16] border border-white/15"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await apiRequest(`/admin/tasks/${encodeURIComponent(tsk.task_id)}/close`, {
                                method: 'POST',
                                body: JSON.stringify({
                                  final_outcome:
                                    taskOutcomeInputs[tsk.task_id] || 'Resolved and verified by admin',
                                }),
                              });
                              setAdminNotice({ type: 'success', text: `Task ${tsk.task_id} closed.` });
                              refreshAdminData();
                            } catch (err: any) {
                              setAdminNotice({ type: 'error', text: err?.message || 'Cannot close task.' });
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                        >
                          Close Task
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}

                {/* Create Support Record */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await apiRequest('/admin/support', {
                        method: 'POST',
                        body: JSON.stringify({
                          order_number: newSupportOrderNum,
                          customer_name: newSupportCustomer,
                          whatsapp_phone: newSupportPhone,
                          issue_summary: newSupportSummary,
                        }),
                      });
                      setNewSupportOrderNum('');
                      setNewSupportCustomer('');
                      setNewSupportPhone('');
                      setNewSupportSummary('');
                      setAdminNotice({ type: 'success', text: 'Support record logged.' });
                      refreshAdminData();
                    } catch (err: any) {
                      setAdminNotice({ type: 'error', text: err?.message || 'Failed to log support ticket.' });
                    }
                  }}
                  className="p-5 rounded-2xl border border-white/10 bg-[#0E1326] space-y-3 text-xs"
                >
                  <h3 className="font-bold text-sm text-[#21D4FD]">Log Customer Support Ticket</h3>
                  <div className="grid sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      placeholder="Order # (optional)"
                      value={newSupportOrderNum}
                      onChange={(e) => setNewSupportOrderNum(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Customer Name"
                      value={newSupportCustomer}
                      onChange={(e) => setNewSupportCustomer(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                    />
                    <input
                      type="text"
                      required
                      placeholder="WhatsApp Phone"
                      value={newSupportPhone}
                      onChange={(e) => setNewSupportPhone(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Issue Summary"
                      value={newSupportSummary}
                      onChange={(e) => setNewSupportSummary(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                    />
                  </div>
                  <button type="submit" className="px-4 py-2 rounded-lg bg-[#7C5CFC] text-white font-bold">
                    Create Support Record
                  </button>
                </form>
              </div>
            )}

            {/* TAB 7: BILINGUAL CMS (Draft/Preview/Publish), TEMPLATES & STORE SETTINGS */}
            {adminTab === 'cms' && adminCmsState && adminFullSettings && (
              <div data-testid="admin-panel-cms" className="space-y-6 text-xs">
                <div className="p-5 rounded-2xl border border-white/10 bg-[#0E1326] space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-[#21D4FD]">
                      Bilingual CMS Draft / Preview / Publish Workflow
                    </h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCmsPreviewMode((p) => !p)}
                        className="px-3 py-1.5 rounded-lg border border-[#21D4FD] text-[#21D4FD] font-bold"
                      >
                        {cmsPreviewMode ? 'Exit Draft Preview' : 'Preview Draft on Storefront'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest('/admin/cms/publish', { method: 'POST' });
                          setAdminNotice({ type: 'success', text: 'CMS draft published live!' });
                          refreshAdminData();
                          loadStorefrontInit();
                        }}
                        className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                      >
                        Publish Draft Live
                      </button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-400 mb-1">Homepage Headline (EN)</label>
                      <input
                        type="text"
                        value={adminCmsState.draft?.homepage?.en?.headline || ''}
                        onChange={(e) => {
                          const nextDraft = JSON.parse(JSON.stringify(adminCmsState.draft));
                          nextDraft.homepage.en.headline = e.target.value;
                          setAdminCmsState({ ...adminCmsState, draft: nextDraft });
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Homepage Headline (AR)</label>
                      <input
                        type="text"
                        value={adminCmsState.draft?.homepage?.ar?.headline || ''}
                        onChange={(e) => {
                          const nextDraft = JSON.parse(JSON.stringify(adminCmsState.draft));
                          nextDraft.homepage.ar.headline = e.target.value;
                          setAdminCmsState({ ...adminCmsState, draft: nextDraft });
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest('/admin/cms', {
                        method: 'PUT',
                        body: JSON.stringify(adminCmsState.draft),
                      });
                      setAdminNotice({ type: 'success', text: 'CMS Draft saved (live site unchanged until published).' });
                      refreshAdminData();
                    }}
                    className="px-4 py-2 rounded-lg bg-[#7C5CFC] text-white font-bold"
                  >
                    Save CMS Draft
                  </button>
                </div>

                {/* Store Settings */}
                <div className="p-5 rounded-2xl border border-white/10 bg-[#0E1326] space-y-4">
                  <h3 className="text-base font-bold text-[#21D4FD]">Store Settings & Payment Configuration</h3>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Store WhatsApp Number</label>
                      <input
                        type="text"
                        value={adminFullSettings.store_whatsapp_number || ''}
                        onChange={(e) =>
                          setAdminFullSettings({ ...adminFullSettings, store_whatsapp_number: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">ILS per 1 USDT Rate</label>
                      <input
                        type="number"
                        step="0.01"
                        value={adminFullSettings.exchange_rate_config?.live_override_rate_ils_per_usdt || 3.7}
                        onChange={(e) =>
                          setAdminFullSettings({
                            ...adminFullSettings,
                            exchange_rate_config: {
                              ...adminFullSettings.exchange_rate_config,
                              live_override_rate_ils_per_usdt: parseFloat(e.target.value || '3.7'),
                            },
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Confirmation Reason (Required)</label>
                      <input
                        type="text"
                        value={settingsReason}
                        onChange={(e) => setSettingsReason(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#080B16] border border-white/15"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await apiRequest('/admin/settings', {
                          method: 'PUT',
                          body: JSON.stringify({
                            store_whatsapp_number: adminFullSettings.store_whatsapp_number,
                            exchange_rate_config: adminFullSettings.exchange_rate_config,
                            maintenance_mode: adminFullSettings.maintenance_mode,
                            confirmation_reason: settingsReason,
                          }),
                        });
                        setAdminNotice({ type: 'success', text: 'Store settings updated.' });
                        refreshAdminData();
                        loadStorefrontInit();
                      } catch (err: any) {
                        setAdminNotice({ type: 'error', text: err?.message || 'Failed to update store settings.' });
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-[#7C5CFC] text-white font-bold"
                  >
                    Save Store Settings
                  </button>
                </div>
              </div>
            )}

            {/* TAB 8: REPORTS, CSV EXPORT & IMMUTABLE AUDIT / ERROR LOGS */}
            {adminTab === 'reports' && (
              <div data-testid="admin-panel-reports" className="space-y-6 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <select
                    value={adminReportType}
                    onChange={(e) => setAdminReportType(e.target.value)}
                    className="px-3.5 py-2 rounded-xl bg-[#0E1326] border border-white/15"
                  >
                    <option value="financial_overview">Financial Overview Report</option>
                    <option value="orders_report">Orders Report</option>
                    <option value="payments_discrepancies">Payments & Discrepancies Report</option>
                    <option value="waiting_and_failed_deliveries">Waiting & Failed Deliveries Report</option>
                    <option value="products_and_inventory">Products & Inventory Report</option>
                    <option value="whatsapp_verifications">WhatsApp Verifications Report</option>
                    <option value="tasks_and_followups">Tasks & Follow-Ups Report</option>
                  </select>
                </div>

                <pre className="p-4 rounded-2xl border border-white/10 bg-[#0E1326] overflow-x-auto text-[11px] text-slate-200">
                  {JSON.stringify(adminReportData, null, 2)}
                </pre>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="p-4 rounded-2xl border border-white/10 bg-[#0E1326] space-y-2">
                    <h3 className="font-bold text-sm text-[#21D4FD]">Recent Audit Logs ({adminAuditLogs.length})</h3>
                    <div className="max-h-64 overflow-y-auto space-y-1.5">
                      {adminAuditLogs.slice(0, 25).map((log, i) => (
                        <div key={i} className="p-2 rounded bg-black/30 border border-white/5">
                          <strong>{log.action}</strong> by <bdi dir="ltr">{log.actor}</bdi> on{' '}
                          <bdi dir="ltr">{log.target_id}</bdi>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl border border-white/10 bg-[#0E1326] space-y-2">
                    <h3 className="font-bold text-sm text-amber-400">
                      Technical Error Logs ({adminErrorLogs.length})
                    </h3>
                    <div className="max-h-64 overflow-y-auto space-y-1.5">
                      {adminErrorLogs.slice(0, 25).map((err, i) => (
                        <div key={i} className="p-2 rounded bg-black/30 border border-white/5">
                          <strong>{err.error_code}</strong> ({err.affected_service}) —{' '}
                          <bdi dir="ltr">{err.created_at}</bdi>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* =====================================================================
          FOOTER — Approved Navigation + Admin Login Link (No Unconfigured Socials)
         ===================================================================== */}
      <footer data-testid="site-footer" className="border-t border-white/10 bg-[#080B16] py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <img src="/assets/orbixa-logo.jpg" alt="Orbixa" className="w-8 h-8 rounded-full object-cover" />
            <div>
              <strong className="text-white block">ORBIXA STORE</strong>
              <span>© {new Date().getFullYear()} orbixashop.web.id — All rights reserved.</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => navigateTo('home')} className="hover:text-white">
              {t.navHome}
            </button>
            <button type="button" onClick={() => navigateTo('shop')} className="hover:text-white">
              {t.navShop}
            </button>
            <button type="button" onClick={() => navigateTo('track')} className="hover:text-white">
              {t.navTrack}
            </button>
            <button type="button" onClick={() => navigateTo('about')} className="hover:text-white">
              {t.navAbout}
            </button>
            <button type="button" onClick={() => navigateTo('contact')} className="hover:text-white">
              {t.navContact}
            </button>
            <button type="button" onClick={() => navigateTo('faq')} className="hover:text-white">
              {t.navFaq}
            </button>
            <button type="button" onClick={() => navigateTo('policies')} className="hover:text-white">
              {t.navPolicies}
            </button>
            <button
              type="button"
              data-testid="footer-admin-login"
              onClick={() => navigateTo(adminUser ? 'admin' : 'login')}
              className="text-[#21D4FD] hover:underline font-semibold"
            >
              {adminUser ? t.navAdmin : t.footerAdminLogin}
            </button>
          </div>

          {/* Only render social links that have a valid configured URL */}
          {storeSettings?.social_links && Object.keys(storeSettings.social_links).length > 0 && (
            <div className="flex gap-3">
              {Object.entries(storeSettings.social_links)
                .filter(([, url]) => typeof url === 'string' && url.startsWith('http'))
                .map(([network, url]) => (
                  <a
                    key={network}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#21D4FD] hover:underline capitalize"
                  >
                    {network}
                  </a>
                ))}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
