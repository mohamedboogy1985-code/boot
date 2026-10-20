# رقعة الإصلاحات الحرجة لمشروع Bogy-Agants

تم إعداد واختبار رقعة جاهزة للمشروع الشقيق **Bogy-Agants (NexusAI)** في الملف:
`docs/patches/Bogy-Agants-critical-fixes.patch`

## ما الذي تصلحه الرقعة؟

1. **`npm start` كان معطّلًا**: كان `node server.ts` يفشل بخطأ استيراد نوعي من Express. أصبح `NODE_ENV=production tsx server.ts` (متحقق: الواجهة تعمل HTTP 200).
2. **فشل التثبيت/البناء**: أُضيفت تبعية `react-is` (ناقصة لازمة لـ recharts) وحُذف تثبيت `esbuild@^0.25.0` المتعارض مع Vite 8 — أصبح `npm install` و`npm run build` ينجحان دون أي أعلام (متحقق).
3. **ثغرة تنفيذ أوامر عن بُعد (RCE) بلا مصادقة**: نقطة `/api/system/execute-command` كانت تنفّذ أي أمر Shell يصلها. في الرقعة أصبحت **معطّلة افتراضيًا (403)** ولا تعمل إلا إذا عيّن المشغّل صراحةً `ENABLE_UNSAFE_SHELL_EXECUTION=true` **و** جاء الطلب من نفس الجهاز (loopback). تذكير: في مشروع `boot` المدمج حُذفت هذه القدرة نهائيًا بالتصميم.

## التطبيق على مستودع Bogy-Agants

```bash
git clone https://github.com/mohamedboogy1985-code/Bogy-Agants.git
cd Bogy-Agants
git apply /path/to/Bogy-Agants-critical-fixes.patch
npm install
npm run build
npm start
git add package.json server.ts
git commit -m "fix: working start script, clean install/build, disable unauthenticated shell execution by default"
git push
```

## لماذا تُسلَّم كرقعة بدل دفع مباشر؟

جلسة العمل الحالية مرتبطة تنظيميًا بفرع مستودع `boot` فقط (`arena/ec090de9-boot`)، لذا تُسلَّم إصلاحات المستودع الثاني كرقعة مختبرة جاهزة للتطبيق بسطر واحد، بينما يوجد الدمج الكامل والآمن داخل `boot` نفسه.
