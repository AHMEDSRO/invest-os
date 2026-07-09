# Invest-OS — نظامك الاستثماري الشخصي 🚀

نظام ويب شخصي (مستخدم واحد) لإدارة إيداعاتك الشهرية في صناديق الاستثمار بين **مصر (ثاندر بالجنيه)** و**الإمارات (Sarwa / StashAway بالدرهم)** — داشبورد، محفظة، جلسة شهرية، وشات بوت مستشار مجاني.

**الستاك:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase + Recharts + Gemini API (مجاني).

---

## 1) إنشاء مشروع Supabase وتشغيل الـ Migration

1. ادخل على [supabase.com](https://supabase.com) واعمل حساب مجاني → **New Project**.
2. اختار اسم للمشروع وكلمة سر قوية لقاعدة البيانات (احتفظ بيها) والمنطقة الأقرب ليك.
3. بعد ما المشروع يجهز، افتح من القائمة الجانبية: **SQL Editor** → **New query**.
4. انسخ محتوى الملف [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) كاملًا والصقه واضغط **Run**.
   - ده بيعمل كل الجداول + سياسات RLS + بيانات أولية (صف الإعدادات و3 صناديق أمثلة).

### إنشاء حسابك وقفل التسجيل (مستخدم واحد فقط)

1. من القائمة: **Authentication → Users → Add user → Create new user**.
   - دخّل إيميلك وكلمة سر، وفعّل **Auto Confirm User**.
2. اقفل التسجيل الجديد: **Authentication → Sign In / Providers** → قفل خيار **Allow new users to sign up**.
   - كده محدش غيرك يقدر يعمل حساب حتى لو وصل لصفحة الدخول.

### جلب المفاتيح

من **Project Settings → API**:
- `Project URL` → ده `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key → ده `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → ده `SUPABASE_SERVICE_ROLE_KEY` (سرّي — ما يتحطش في أي مكان عام)

---

## 2) الحصول على مفتاح Gemini المجاني

1. ادخل على [aistudio.google.com](https://aistudio.google.com) بحساب جوجل.
2. من القائمة: **Get API key → Create API key**.
3. انسخ المفتاح → ده `GEMINI_API_KEY`.

الـ free tier كافي جدًا للاستخدام الشخصي (النظام فيه rate limit داخلي 30 رسالة/ساعة عشان تفضل جواه).

### تبديل مزوّد الشات بوت لاحقًا (اختياري)

غيّر متغير واحد بس في `.env.local`:

```
LLM_PROVIDER=groq        # ومعاه GROQ_API_KEY
# أو
LLM_PROVIDER=openrouter  # ومعاه OPENROUTER_API_KEY
```

---

## 3) التشغيل محليًا

```bash
# 1. ثبّت الاعتمادات
npm install

# 2. انسخ ملف البيئة واملأه بالقيم اللي جمعتها فوق
cp .env.example .env.local

# 3. شغّل
npm run dev
```

افتح [http://localhost:3000](http://localhost:3000) وسجّل دخول بالإيميل اللي عملته في Supabase.

> ⚠️ ملف `.env.local` متجاهَل تلقائيًا في git — **ممنوع** رفع أي مفتاح على GitHub.

---

## 4) الرفع على GitHub

```bash
# الريبو جاهز بـ commits منظمة — اربطه بريبو جديد عندك:
git remote add origin https://github.com/USERNAME/invest-os.git
git push -u origin main
```

(اعمل الريبو **Private** — ده نظامك المالي الشخصي.)

---

## 5) النشر على Vercel

1. ادخل [vercel.com](https://vercel.com) → **Add New → Project** → اختار ريبو `invest-os`.
2. Vercel هيتعرف على Next.js تلقائيًا — مفيش إعدادات build إضافية ولا حاجة لـ `vercel.json`.
3. قبل الضغط على Deploy، افتح **Environment Variables** وضيف:

| المتغير | القيمة |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | من Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | من Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | من Supabase (سرّي) |
| `LLM_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | من AI Studio |

4. **Deploy** — وبعد دقيقة النظام شغال على رابطك.

---

## هيكل النظام

| الصفحة | الوظيفة |
|---|---|
| `/login` | دخول بالإيميل (التسجيل مقفول) |
| `/` | داشبورد: KPIs + نقطة التعادل d* + 4 رسوم بيانية |
| `/portfolio` | الحيازات + تحديث القيم + إدارة الصناديق |
| `/deposits` | تسجيل الإيداعات (سعر الصرف بيتجاب تلقائيًا) |
| `/chat` | مستشار AI بيقرأ بياناتك الفعلية من النظام |

**منطق العملة:** العرض الموحّد بالدرهم. تكلفة الإيداعات المصرية بتتحسب بسعر الصرف يوم الإيداع، والقيمة الحالية بآخر سعر في `fx_history` — وده اللي بيخلي العائد الكلي **شامل أثر تخفيض الجنيه**.

**نقطة التعادل:** `d* = 1 − (1+r_ae)/(1+r_eg)` — مصر تكسب طالما التخفيض السنوي المتوقع للجنيه أقل من d*.
