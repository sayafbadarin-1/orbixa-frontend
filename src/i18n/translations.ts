/**
 * Orbixa Store — Bilingual Localization & Bidi Formatting Utilities (translations.ts)
 * Enforces:
 * - Browser language detection on first visit with Arabic ('ar') fallback
 * - Persistent customer language selection in localStorage
 * - Bidi-isolated formatting for order numbers, phone numbers, transaction refs, and currency amounts
 */

import { Language } from '../types/orbixa';

const STORAGE_KEY = 'orbixa_preferred_lang';

export function detectInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ar' || saved === 'en') {
      return saved;
    }
    if (typeof navigator !== 'undefined' && navigator.language) {
      const navLang = navigator.language.toLowerCase();
      if (navLang.startsWith('en')) return 'en';
      if (navLang.startsWith('ar')) return 'ar';
    }
  } catch {
    // Ignore storage block in restricted sandboxes
  }
  return 'ar';
}

export function persistLanguageChoice(lang: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Ignore storage block
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
}

export function formatCurrencyILS(amount: number): string {
  const num = Number(amount || 0).toFixed(2);
  return `${num} ₪`;
}

export function formatCurrencyUSDT(amount: number): string {
  const num = Number(amount || 0).toFixed(2);
  return `${num} USDT`;
}

export const UI_STRINGS: Record<Language, Record<string, string>> = {
  ar: {
    brandName: 'ORBIXA STORE',
    navHome: 'الرئيسية',
    navShop: 'المتجر',
    navTrack: 'تتبع طلبك',
    navAbout: 'عن المتجر',
    navContact: 'تواصل معنا',
    navFaq: 'الأسئلة الشائعة',
    navPolicies: 'الشروط والسياسات',
    navCart: 'السلة',
    navAdmin: 'لوحة الإدارة',
    footerAdminLogin: 'تسجيل دخول الإدارة',
    heroHeadline: 'عالمك الرقمي يبدأ من هنا',
    heroSupporting: 'عالمك الرقمي.',
    heroDescription: 'اكتشف اشتراكات مميزة، وأدوات ذكاء اصطناعي قوية، وبرامج إبداعية، وخدمات رقمية متنوعة — كلها في مكان واحد.',
    heroCta: 'تصفّح المتجر',
    heroTagline: 'كل عالمك الرقمي، في وجهة واحدة.',
    searchPlaceholder: 'ابحث باسم المنتج أو القسم أو الرمز...',
    allCategories: 'جميع الأقسام',
    sortNewest: 'الأحدث أولاً',
    sortName: 'الاسم (أ-ي)',
    sortPriceAsc: 'السعر: من الأقل للأعلى',
    sortPriceDesc: 'السعر: من الأعلى للأقل',
    sortFeatured: 'المنتجات المميزة',
    loadMore: 'عرض المزيد من المنتجات',
    availableBadge: 'متوفر للتسليم',
    unavailableBadge: 'غير متوفر حالياً',
    addToCart: 'أضف إلى السلة',
    viewDetails: 'التفاصيل والخيارات',
    backToShop: 'العودة إلى المتجر',
    selectVariantLabel: 'اختر الباقة / المدة:',
    quantityLabel: 'الكمية:',
    deliveryInfoTitle: 'معلومات التسليم الرقمي',
    emptyStoreNotice: 'المتجر جاهز للإنتاج — لا توجد منتجات منشورة حالياً حتى يقوم مدير المتجر بإضافة المنتجات الفعلية.',
    emptyCartNotice: 'سلة التسوق فارغة حالياً. تصفح المتجر لإضافة منتجاتك الرقمية.',
    cartTitle: 'سلة التسوق وإتمام الطلب',
    revalidateCartBtn: 'تحديث الأسعار والتحقق من التوفر',
    priceChangeWarning: 'تم تحديث سعر منتج واحد أو أكثر في الخادم. يرجى مراجعة الأسعار المحدثة والموافقة عليها للمتابعة.',
    approvePriceChangeBtn: 'أوافق على الأسعار المحدثة للمتابعة',
    removeUnavailableBtn: 'إزالة المنتجات غير المتوفرة',
    whatsappVerifyTitle: 'تأكيد رقم واتساب الإلزامي قبل الدفع',
    whatsappVerifyStep1: '1. أدخل اسمك ورقم واتساب (+970 أو +972).',
    whatsappVerifyStep2: '2. اضغط لإرسال رسالة التحقق عبر واتساب للمتجر.',
    whatsappVerifyStep3: '3. بعد تحقق الإدارة من رسالتك الواردة، يتفعل الدفع وإنشاء الطلب فوراً.',
    customerNameLabel: 'الاسم الكامل',
    countryCodeLabel: 'مقدمة الدولة',
    whatsappDigitsLabel: 'رقم واتساب (بدون الصفر الأول)',
    requestVerificationBtn: 'إرسال طلب تأكيد الرقم',
    openWhatsappBtn: 'فتح واتساب وإرسال رسالة التحقق',
    checkStatusBtn: 'تحديث حالة الموافقة',
    paymentMethodTitle: 'اختر طريقة الدفع المعتمدة',
    reflectMethodLabel: 'تطبيق ريفلكت — Reflect (بالشيكل ₪)',
    binanceMethodLabel: 'محفظة بينانس — Binance USDT',
    createOrderBtn: 'إنشاء الطلب وحجز المخزون (مهلة 20 دقيقة)',
    paymentDeadlineNotice: 'مهلة إرسال إشعار التحويل: 20 دقيقة من لحظة إنشاء الطلب على الخادم.',
    trackingTitle: 'تتبع الطلب وإرسال إشعار الدفع',
    trackingTokenPlaceholder: 'أدخل رمز التتبع السري الخاص بطلبك...',
    loadTrackingBtn: 'عرض حالة الطلب',
    copyOrderNumberBtn: 'نسخ رقم الطلب',
    submitPaymentReportBtn: 'إرسال إشعار التحويل للمراجعة',
    adminLoginTitle: 'تسجيل دخول مدير المتجر',
    adminWhatsappSectionTitle: 'تأكيد أرقام واتساب',
    adminWaitingOrdersTitle: 'الطلبات المنتظرة',
    deliveryFailedStateLabel: 'تعذّر التسليم — بانتظار معالجة',
  },
  en: {
    brandName: 'ORBIXA STORE',
    navHome: 'Home',
    navShop: 'Shop',
    navTrack: 'Track Order',
    navAbout: 'About',
    navContact: 'Contact',
    navFaq: 'FAQ',
    navPolicies: 'Policies & Terms',
    navCart: 'Cart',
    navAdmin: 'Admin Console',
    footerAdminLogin: 'Admin Login',
    heroHeadline: 'WELCOME TO ORBIXA',
    heroSupporting: 'Your Digital Universe.',
    heroDescription: 'Discover premium subscriptions, powerful AI tools, creative software, and digital essentials — all in one place.',
    heroCta: 'EXPLORE THE SHOP',
    heroTagline: 'YOUR DIGITAL WORLD, ONE DESTINATION.',
    searchPlaceholder: 'Search by product name, category, or SKU...',
    allCategories: 'All Categories',
    sortNewest: 'Newest First',
    sortName: 'Name (A-Z)',
    sortPriceAsc: 'Price: Low to High',
    sortPriceDesc: 'Price: High to Low',
    sortFeatured: 'Featured First',
    loadMore: 'Load More Products',
    availableBadge: 'Available',
    unavailableBadge: 'Currently Unavailable',
    addToCart: 'Add to Cart',
    viewDetails: 'Details & Variants',
    backToShop: 'Back to Shop',
    selectVariantLabel: 'Select Plan / Variant:',
    quantityLabel: 'Quantity:',
    deliveryInfoTitle: 'Digital Fulfillment Details',
    emptyStoreNotice: 'Production storefront initialized — no products are listed until the administrator creates real catalog items.',
    emptyCartNotice: 'Your shopping cart is currently empty. Explore the shop to add digital products.',
    cartTitle: 'Shopping Cart & Secure Checkout',
    revalidateCartBtn: 'Revalidate Prices & Stock',
    priceChangeWarning: 'One or more item prices changed on the server. Please review and approve the updated prices to continue.',
    approvePriceChangeBtn: 'Approve Updated Server Prices',
    removeUnavailableBtn: 'Remove Unavailable Items',
    whatsappVerifyTitle: 'Mandatory WhatsApp Verification Before Checkout',
    whatsappVerifyStep1: '1. Enter your name and WhatsApp number (+970 or +972).',
    whatsappVerifyStep2: '2. Click to open WhatsApp with your prefilled verification message to the store.',
    whatsappVerifyStep3: '3. Once the admin verifies your incoming message, order creation and payment unlock.',
    customerNameLabel: 'Full Name',
    countryCodeLabel: 'Country Code',
    whatsappDigitsLabel: 'WhatsApp Number (local digits)',
    requestVerificationBtn: 'Request WhatsApp Verification',
    openWhatsappBtn: 'Open WhatsApp & Send Verification Message',
    checkStatusBtn: 'Check Approval Status',
    paymentMethodTitle: 'Select Approved Payment Method',
    reflectMethodLabel: 'Reflect App (ILS / ₪)',
    binanceMethodLabel: 'Binance Wallet (USDT)',
    createOrderBtn: 'Create Order & Reserve Stock (20-Min Window)',
    paymentDeadlineNotice: 'Payment reporting window: 20 minutes from server-side order creation.',
    trackingTitle: 'Private Order Tracking & Payment Submission',
    trackingTokenPlaceholder: 'Enter your private order tracking token...',
    loadTrackingBtn: 'Track Order',
    copyOrderNumberBtn: 'Copy Order Number',
    submitPaymentReportBtn: 'Submit Payment Transfer Report',
    adminLoginTitle: 'Administrator Sign In',
    adminWhatsappSectionTitle: 'تأكيد أرقام واتساب (WhatsApp Verifications)',
    adminWaitingOrdersTitle: 'الطلبات المنتظرة (Waiting Orders)',
    deliveryFailedStateLabel: 'Delivery Failed — Awaiting Resolution (تعذّر التسليم — بانتظار معالجة)',
  },
};
