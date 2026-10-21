# النشر أونلاين بدومين عام (Render / Railway / Docker)

المشروع جاهز للنشر بضغطة واحدة. أهم حقيقة معمارية قبل أن تبدأ:

> **ما يعمل في السحابة**: الواجهة، المحادثة الصوتية (تحتاج HTTPS — توفره المنصات)، التحليل المالي بـ Gemini، التصدير، المخططات، المُنسّق، محوّل المتصفح، وتشخيص **الخادم السحابي نفسه**.
> **ما يظل محليًا فقط بطبيعته**: الفأرة/لوحة المفاتيح الحقيقيتان (تحتاجان سطح مكتب جهازك)، وجسر Ollama (يعمل على جهازك). في السحابة تبقى هذه بوضع المعاينة الآمن/غير المتصل كما هو مصمم — وللتحكم الحقيقي شغّل المشروع على جهازك كما في ملف `README.md`.

## الخيار الأول: Render (موصى به — نشر تلقائي عند كل دمج)

1. ادفع هذا المستودع إلى GitHub (تم) وتأكد من وجود `render.yaml` في الجذر (موجود).
2. افتح الرابط التالي وسجّل دخولك بحساب GitHub واختر مستودع `boot`:
   https://render.com/deploy?repo=https://github.com/mohamedboogy1985-code/boot
3. عند طلب المتغيرات، الصق قيمة `GEMINI_API_KEY` (لا تُكتب في الكود أبدًا) واترك `ENABLE_DESKTOP_ADAPTERS=false`.
4. اضغط Deploy. ستحصل على دومين فوري مثل `https://chatterbots-remix.onrender.com`.
5. **دومين مخصص**: من لوحة الخدمة في Render ← ‏Settings ← ‏Custom Domains ← أضف دومينك واتبع سجلّي DNS الذين يعرضهما (شهادة HTTPS تُصدر تلقائيًا).
6. أي دمج لاحق في `main` سيُعاد نشره تلقائيًا (`autoDeploy: true`).

ملحوظة الخطة المجانية: الخدمة "تنام" بعد الخمول وتستيقظ خلال ~دقيقة عند أول طلب.

## الخيار الثاني: Railway

1. من railway.app ← ‏New Project ← ‏Deploy from GitHub repo ← اختر `boot` (سيقرأ `railway.toml` تلقائيًا: بناء `npm install && npm run build` وتشغيل `npm start` وفحص صحة `/api/status`).
2. أضف متغير `GEMINI_API_KEY` من تبويب Variables، واترك `ENABLE_DESKTOP_ADAPTERS=false`.
3. من ‏Settings ← ‏Networking فعّل **Generate Domain** أو اربط دومينك المخصص.

## الخيار الثالث: Docker على أي خادم (VPS)

```bash
git clone https://github.com/mohamedboogy1985-code/boot.git
cd boot
docker build -t chatterbots-remix .
docker run -d --name chatterbots -p 3000:3000 \
  -e GEMINI_API_KEY="ضع_مفتاحك" \
  -e ENABLE_DESKTOP_ADAPTERS=false \
  chatterbots-remix
# افتح http://SERVER-IP:3000 — وضع خلفه Caddy/Nginx بشهادة HTTPS للدومين العام
```

## متغيرات البيئة في الإنتاج

| المتغير | القيمة في السحابة |
|---|---|
| `GEMINI_API_KEY` | مفتاحك الحقيقي (من لوحة المنصة فقط) — بدونه يعمل وضع المحاكاة الموسوم |
| `PORT` | تحقنه المنصة تلقائيًا — الخادم يقرؤه |
| `ENABLE_DESKTOP_ADAPTERS` | `false` دائمًا في السحابة |
| `OLLAMA_HOST` | اتركه افتراضيًا (سيظهر غير متصل بأمان) |

## أمان ما بعد النشر

- لا توجد أي نقطة تنفيذ أوامر نظام في الخادم — النشر العام آمن من هذه الناحية.
- كل إجراءات المحوّلات تتطلب موافقة المستخدم وتُسجَّل في سجل التدقيق، والجلب الشبكي محروس ضد SSRF.
- الكاميرا/الميكروفون يتطلبان HTTPS — لا تنشر عبر HTTP مكشوف بدومين عام.
