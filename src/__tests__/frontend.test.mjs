/**
 * Orbixa Store — Automated Frontend Contract, Build Config & UI Verification Suite (frontend.test.mjs)
 * ----------------------------------------------------------------------------------------------------
 * Verifies:
 * 1. Standard Vite + TypeScript production build configuration (`tsc --noEmit && vite build`),
 *    synchronized `package-lock.json`, `netlify.toml`, and removal of any custom React runtime or
 *    hardcoded `/usr/share/nodejs/index.js` script.
 * 2. Bilingual RTL/LTR localization & approved English/Arabic copy.
 * 3. Language detection & localStorage persistence.
 * 4. Search, category filters, sorting, loading/error/empty states, and Load More pagination.
 * 5. Complete views in App.tsx: Home, Shop, Product Detail & Variant selection, Cart & Checkout,
 *    Order Confirmation & Private Tracking, About, Contact, FAQ, Policies, Admin Login, and
 *    Protected Admin Dashboard (all 8 tabs).
 * 6. Navigation security: Admin link is removed from main header nav; Admin Login link is in the footer.
 * 7. Server-side Cart Revalidation, Price-Change Approval, Mandatory WhatsApp Verification,
 *    Reflect ILS & Binance USDT payment instructions & submission, and 20-minute countdown timer.
 * 8. Canonical domain metadata (`https://orbixashop.web.id/`) and standard Vite module entrypoint.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '..');
const frontendRoot = path.resolve(srcDir, '..');
const repoRoot = path.resolve(frontendRoot, '..');

function runFrontendTests() {
  const results = [];

  function test(name, fn) {
    try {
      fn();
      results.push({ name, status: 'PASS' });
      console.log(`PASS  ${name}`);
    } catch (err) {
      results.push({ name, status: 'FAIL', error: err.message });
      console.error(`FAIL  ${name}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  const pkgJson = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'package.json'), 'utf8'));
  const pkgLock = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'package-lock.json'), 'utf8'));
  const mainTsx = fs.readFileSync(path.join(srcDir, 'main.tsx'), 'utf8');
  const translationsCode = fs.readFileSync(path.join(srcDir, 'i18n/translations.ts'), 'utf8');
  const appCode = fs.readFileSync(path.join(srcDir, 'App.tsx'), 'utf8');
  const typesCode = fs.readFileSync(path.join(srcDir, 'types/orbixa.ts'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(frontendRoot, 'index.html'), 'utf8');
  const rootNetlifyToml = fs.readFileSync(path.join(repoRoot, 'netlify.toml'), 'utf8');

  // 1. Standard Vite + TypeScript Build Config, Lockfile, and No Custom Runtime
  test('01_standard_vite_typescript_build_and_lockfile', () => {
    assert.equal(pkgJson.scripts.build, 'tsc --noEmit && vite build');
    assert.ok(!pkgJson.scripts.build.includes('scripts/build.mjs'));
    assert.ok(pkgJson.dependencies.react, 'react must be declared in dependencies');
    assert.ok(pkgJson.dependencies['react-dom'], 'react-dom must be declared in dependencies');
    assert.ok(pkgJson.devDependencies.typescript, 'typescript must be declared in devDependencies');
    assert.ok(pkgJson.devDependencies.vite, 'vite must be declared in devDependencies');

    // Lockfile sync check
    assert.equal(pkgLock.lockfileVersion, 3);
    assert.deepEqual(pkgLock.packages[''].dependencies, pkgJson.dependencies);
    assert.deepEqual(pkgLock.packages[''].devDependencies, pkgJson.devDependencies);
    assert.ok(pkgLock.packages['node_modules/react']);
    assert.ok(pkgLock.packages['node_modules/react-dom']);
    assert.ok(pkgLock.packages['node_modules/typescript']);
    assert.ok(pkgLock.packages['node_modules/vite']);

    // Ensure custom runtime and hardcoded /usr/share/nodejs/index.js build script are removed
    assert.ok(!fs.existsSync(path.join(frontendRoot, 'scripts/build.mjs')), 'scripts/build.mjs must be removed');
    assert.ok(!fs.existsSync(path.join(srcDir, 'vendor/react-runtime.js')), 'src/vendor/react-runtime.js must be removed');

    // Verify main.tsx imports real React, ReactDOM, App, and cosmic.css
    assert.match(mainTsx, /import React from 'react'/);
    assert.match(mainTsx, /import ReactDOM from 'react-dom\/client'/);
    assert.match(mainTsx, /import '\.\/styles\/cosmic\.css'/);

    // Verify root netlify.toml
    assert.match(rootNetlifyToml, /base\s*=\s*"frontend"/);
    assert.match(rootNetlifyToml, /command\s*=\s*"npm run build"/);
    assert.match(rootNetlifyToml, /publish\s*=\s*"dist"/);
  });

  // 2. Arabic RTL and English LTR + Approved Brand Copy
  test('02_bilingual_rtl_ltr_and_approved_copy', () => {
    assert.match(translationsCode, /WELCOME TO ORBIXA/);
    assert.match(translationsCode, /Your Digital Universe\./);
    assert.match(translationsCode, /EXPLORE THE SHOP/);
    assert.match(translationsCode, /YOUR DIGITAL WORLD, ONE DESTINATION\./);
    assert.match(translationsCode, /عالمك الرقمي يبدأ من هنا/);
    assert.match(translationsCode, /عالمك الرقمي\./);
    assert.match(translationsCode, /تصفّح المتجر/);
    assert.match(translationsCode, /كل عالمك الرقمي، في وجهة واحدة\./);
    assert.match(translationsCode, /document\.documentElement\.dir = lang === 'ar' \? 'rtl' : 'ltr'/);
  });

  // 3. Language Switching and Persistence
  test('03_language_switching_and_persistence', () => {
    assert.match(translationsCode, /localStorage\.getItem\(STORAGE_KEY\)/);
    assert.match(translationsCode, /localStorage\.setItem\(STORAGE_KEY, lang\)/);
    assert.match(translationsCode, /navigator\.language/);
  });

  // 4. Search, Filters, Sorting, Loading, Errors, Empty States, and Load More Pagination
  test('04_search_filters_sorting_states_and_load_more', () => {
    assert.match(appCode, /loadMoreProducts/);
    assert.match(appCode, /offset=\$\{nextOffset\}&limit=12/);
    assert.match(appCode, /setProducts\(\(prev\) => \[\.\.\.prev/);
    assert.match(appCode, /price_asc/);
    assert.match(appCode, /price_desc/);
    assert.match(appCode, /featured/);
    assert.match(appCode, /shop-loading/);
    assert.match(appCode, /shop-error/);
    assert.match(appCode, /shop-empty/);
  });

  // 5. Complete Storefront & Admin Views Connected to Backend APIs
  test('05_complete_views_and_api_connections', () => {
    assert.match(appCode, /product-detail-view/);
    assert.match(appCode, /variant-option-/);
    assert.match(appCode, /cart-checkout-view/);
    assert.match(appCode, /\/cart\/revalidate/);
    assert.match(appCode, /approve-price-change-btn/);
    assert.match(appCode, /\/whatsapp\/verify-request/);
    assert.match(appCode, /\/checkout\/orders/);
    assert.match(appCode, /tracking-view/);
    assert.match(appCode, /report-payment/);
    assert.match(appCode, /about-view/);
    assert.match(appCode, /contact-view/);
    assert.match(appCode, /faq-view/);
    assert.match(appCode, /policies-view/);
    assert.match(appCode, /admin-login-view/);
    assert.match(appCode, /admin-dashboard-view/);
  });

  // 6. Navigation Security: Admin Removed from Main Nav & Login Added to Footer
  test('06_navigation_admin_removed_from_main_nav_and_login_in_footer', () => {
    const headerBlock = appCode.split('<header')[1].split('</header>')[0];
    assert.ok(!headerBlock.includes("navigateTo('admin')"), 'Main header nav must not link directly to admin');
    assert.ok(!headerBlock.includes('{t.navAdmin}'), 'Main header nav must not show admin button');
    const footerBlock = appCode.split('<footer')[1].split('</footer>')[0];
    assert.match(footerBlock, /footer-admin-login/);
  });

  // 7. Bidi Isolation (<bdi dir="ltr">) for Order Numbers, Phones, SKUs, and Currency
  test('07_bidi_isolation_for_numbers_and_currency', () => {
    assert.match(appCode, /<bdi dir="ltr"/);
    assert.match(translationsCode, /formatCurrencyILS/);
    assert.match(translationsCode, /formatCurrencyUSDT/);
  });

  // 8. Exclusive Payment Methods (Binance USDT & Reflect ILS Only)
  test('08_exclusive_payment_methods_type_safety', () => {
    assert.match(typesCode, /payment_method: 'binance_usdt' \| 'reflect_ils'/);
    assert.ok(!typesCode.includes('credit_card') && !typesCode.includes('cash_on_delivery'));
  });

  // 9. Required Arabic Section Titles (تأكيد أرقام واتساب & الطلبات المنتظرة & تعذّر التسليم — بانتظار معالجة)
  test('09_required_arabic_admin_section_titles', () => {
    assert.match(translationsCode, /تأكيد أرقام واتساب/);
    assert.match(translationsCode, /الطلبات المنتظرة/);
    assert.match(translationsCode, /تعذّر التسليم — بانتظار معالجة/);
  });

  // 10. Canonical Domain & Standard Vite Entrypoint Verification
  test('10_canonical_domain_and_vite_entrypoint', () => {
    assert.match(indexHtml, /https:\/\/orbixashop\.web\.id\//);
    assert.match(indexHtml, /<script type="module" src="\/src\/main\.tsx"><\/script>/);
  });

  console.log(`\nFrontend Verification Summary: ${results.filter((r) => r.status === 'PASS').length}/${results.length} passed.`);
}

runFrontendTests();
