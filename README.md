# Tax Invoice Exporter

افزونه Chrome Manifest V3 برای استخراج محلی اطلاعات صورتحساب‌های کارپوشه مؤدیان و ساخت فایل Excel راست‌به‌چپ.

## Folder Structure

- `manifest.json` — تعریف افزونه، مجوزها و content scriptها.
- `service-worker.js` — badge و وضعیت صفحه.
- `extractor.js` — موتور تشخیص معنایی، جدول‌ها، فیلدها و Mutation-friendly extraction.
- `content.js` — اتصال صفحه به popup و مشاهده تغییرات DOM با MutationObserver.
- `popup.html`, `popup.js` — داشبورد، پیش‌نمایش و خروجی Excel و CSV قابل استفاده در Google Sheets.
- `settings.html`, `settings.js` — نمایش لیست عنوان/مقدار کشف‌شده، انتخاب فیلدها، ترتیب ستون‌ها و ذخیره در `chrome.storage.sync`.
- `excel-exporter.js` — تولید XLSX واقعی به صورت محلی با worksheet راست‌به‌چپ و ستون‌های خلاصه مطابق قالب مدنظر.
- `styles.css` — رابط کاربری RTL، واکنش‌گرا و سازگار با حالت تاریک.

## Installation Guide

1. Chrome را باز کنید و به `chrome://extensions` بروید.
2. گزینه Developer mode را روشن کنید.
3. روی Load unpacked کلیک کنید.
4. پوشه پروژه را انتخاب کنید.

## Build Instructions

این نسخه بدون مرحله build اجرا می‌شود. همه فایل‌ها static هستند و داده‌ای به سرور خارجی ارسال نمی‌شود.

برای سازگاری با محیط‌هایی که فایل binary را نمی‌پذیرند، هیچ asset تصویری/آیکون binary داخل مخزن نگهداری نمی‌شود.

## Usage Instructions

1. وارد صفحه صورتحساب در `tp.tax.gov.ir` یا نمونه `hardcore-char-endd.pagedrop.io` شوید.
2. افزونه به صورت خودکار صفحه را با MutationObserver اسکن می‌کند.
3. از popup پیش‌نمایش را بررسی کنید.
4. از Settings لیست عنوان/مقدارهای کشف‌شده را ببینید و دقیقاً انتخاب کنید کدام فیلدها در خروجی بیاید؛ انتخاب‌ها برای دفعات بعد ذخیره می‌شوند.
5. پس از تنظیم اولیه، با کلیک روی آیکن افزونه صفحه به‌صورت خودکار اسکن می‌شود و می‌توانید Excel یا CSV قابل باز شدن در Google Sheets بگیرید. هر صورتحساب جدید به ردیف‌های پایین فایل خروجی اضافه می‌شود و اگر «مبلغ واحد» برای چند کالا متفاوت باشد، مقادیر با خط فاصله کنار هم قرار می‌گیرند.

## Privacy

تمام پردازش‌ها داخل مرورگر کاربر انجام می‌شود. افزونه analytics، tracking و remote API ندارد.

Copyright © Pedram Nakhostin / © پدرام نخستین
