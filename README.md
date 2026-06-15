# Pedram Tax Exporter

افزونه Chrome Manifest V3 برای استخراج محلی اطلاعات صورتحساب‌های کارپوشه مؤدیان و ساخت فایل Excel راست‌به‌چپ.

## Folder Structure

- `manifest.json` — تعریف افزونه، مجوزها و content scriptها.
- `service-worker.js` — badge و وضعیت صفحه.
- `extractor.js` — موتور تشخیص معنایی، جدول‌ها، فیلدها و Mutation-friendly extraction.
- `content.js` — اتصال صفحه به popup و مشاهده تغییرات DOM با MutationObserver.
- `popup.html`, `popup.js` — داشبورد، پیش‌نمایش و خروجی Excel.
- `settings.html`, `settings.js` — مدیریت فیلدها، ترتیب ستون‌ها و ذخیره در `chrome.storage.sync`.
- `excel-exporter.js` — تولید XLSX واقعی به صورت محلی با worksheet راست‌به‌چپ.
- `styles.css` — رابط کاربری RTL، واکنش‌گرا و سازگار با حالت تاریک.

## Installation Guide

1. Chrome را باز کنید و به `chrome://extensions` بروید.
2. گزینه Developer mode را روشن کنید.
3. روی Load unpacked کلیک کنید.
4. پوشه پروژه را انتخاب کنید.

## Build Instructions

این نسخه بدون مرحله build اجرا می‌شود. همه فایل‌ها static هستند و داده‌ای به سرور خارجی ارسال نمی‌شود.

## Usage Instructions

1. وارد صفحه صورتحساب در `tp.tax.gov.ir` یا نمونه `hardcore-char-endd.pagedrop.io` شوید.
2. افزونه به صورت خودکار صفحه را با MutationObserver اسکن می‌کند.
3. از popup پیش‌نمایش را بررسی کنید.
4. از Settings فیلدها را فعال/غیرفعال یا مرتب کنید.
5. روی «دریافت فایل Excel» کلیک کنید.

## Privacy

تمام پردازش‌ها داخل مرورگر کاربر انجام می‌شود. افزونه analytics، tracking و remote API ندارد.

Copyright © Pedram Nakhostin / © پدرام نخستین
