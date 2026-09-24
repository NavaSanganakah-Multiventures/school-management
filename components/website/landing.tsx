import Link from 'next/link';
import {
  GraduationCap,
  School,
  Users,
  CalendarCheck,
  FileText,
  BellRing,
  ShieldCheck,
  Zap,
  Rocket,
  IndianRupee,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

export interface PortfolioSchool {
  slug: string;
  name: string;
  domain: string;
}

const FEATURES = [
  {
    icon: Users,
    title: 'स्कॉलर रजिस्टर (दाखिला-खारिज)',
    desc: 'छात्रों का पूरा रजिस्टर — दाखिला, टीसी (निकासी) एवं री-एडमिशन एक ही जगह।',
  },
  {
    icon: IndianRupee,
    title: 'फीस चालान एवं रसीदें',
    desc: 'फीस हेड, चालान, जमा राशि और छात्र-वार रसीदें — हिसाब हमेशा साफ़।',
  },
  {
    icon: CalendarCheck,
    title: 'दैनिक उपस्थिति',
    desc: 'स्टाफ एवं छात्र उपस्थिति दर्ज करें — देरी से बचने के लिए त्वरित अलर्ट।',
  },
  {
    icon: FileText,
    title: 'परीक्षा व रिपोर्ट कार्ड',
    desc: 'मार्क्स-एंट्री, ग्रेड और CBSE/State Board फॉर्मेट में रिपोर्ट कार्ड (PDF)।',
  },
  {
    icon: BellRing,
    title: 'अभिभावक अलर्ट',
    desc: 'अनुपस्थिति, फीस-बकाया और नोटिस — WhatsApp/FCM पुश के साथ तत्काल सूचना।',
  },
  {
    icon: ShieldCheck,
    title: '3-रोल सुरक्षित प्रणाली',
    desc: 'Director / Principal / Staff — हर भूमिका के लिए नियंत्रित अनुमतियां।',
  },
];

const STEPS = [
  {
    icon: School,
    title: '1. स्कूल रजिस्टर करें',
    desc: 'वेबसाइट पर एक फॉर्म भरें — स्कूल का नाम, ईमेल, फोन। 30 सेकंड से भी कम।',
  },
  {
    icon: Zap,
    title: '2. FREE TRIAL तुरंत सक्रिय',
    desc: 'पंजीकरण के साथ ही 7-दिन का निःशुल्क ट्रायल शुरू — किसी approval की प्रतीक्षा नहीं।',
  },
  {
    icon: Rocket,
    title: '3. अपना पोर्टल live हो जाता है',
    desc: 'आपके स्कूल का निजी पोर्टल (slug.pragnya.nasven.com) कुछ ही मिनटों में तैयार और आप सब कुछ प्रबंधित कर सकते हैं।',
  },
];

const PLANS = [
  {
    id: 'trial',
    name: '7-दिन ट्रायल',
    price: '₹0',
    per: '7 दिन',
    desc: 'पूरे प्लेटफ़ॉर्म का निःशुल्क परीक्षण',
    highlight: false,
  },
  {
    id: 'starter',
    name: 'स्टार्टर',
    price: '₹2,499',
    per: 'प्रति माह',
    desc: '500 छात्रों तक के छोटे स्कूलों के लिए',
    highlight: false,
  },
  {
    id: 'pro',
    name: 'प्रो (Professional)',
    price: '₹5,999',
    per: 'प्रति माह',
    desc: '1500 छात्रों तक — पूरी सुविधाएं + रिपोर्ट कार्ड',
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'एंटरप्राइज',
    price: 'कस्टम',
    per: 'असीमित',
    desc: 'बड़े स्कूल/ग्रुप — custom features और सहायता',
    highlight: false,
  },
];

export function LandingPage({schools}: {schools: PortfolioSchool[]}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-slate-800/70 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700">
              <GraduationCap className="h-5 w-5 text-white" />
            </span>
            <span className="text-lg font-bold tracking-tight">Pragnya Mitra</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#features" className="hover:text-white">विशेषताएं</a>
            <a href="#how" className="hover:text-white">कैसे काम करता है</a>
            <a href="#portfolio" className="hover:text-white">पोर्टफोलियो</a>
            <a href="#plans" className="hover:text-white">योजनाएं</a>
          </nav>
          <Link
            href="/register"
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:from-indigo-500 hover:to-violet-500"
          >
            स्कूल रजिस्टर करें
          </Link>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(600px circle at 20% 20%, rgba(99,102,241,0.35), transparent 45%), radial-gradient(600px circle at 80% 10%, rgba(139,92,246,0.28), transparent 45%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-300">
              <Zap className="h-3.5 w-3.5" />
              7-दिन FREE TRIAL · कोई approval नहीं · तुरंत शुरू करें
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
              हर स्कूल का
              <span className="block bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                अपना निजी डिजिटल पोर्टल
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-slate-400 sm:text-lg">
              दाखिला-खारिज, फीस, उपस्थिति, परीक्षा, रिपोर्ट कार्ड और अभिभावक अलर्ट —
              सब कुछ आपके स्कूल की अपनी सुरक्षित वेबसाइट (portal) पर।
              अभी रजिस्टर करें और तुरंत शुरू करें।
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-7 py-3.5 text-base font-bold text-white shadow-xl shadow-indigo-900/40 transition hover:from-indigo-500 hover:to-violet-500"
              >
                अभी निःशुल्क शुरू करें <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-7 py-3.5 text-base font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
              >
                कैसे काम करता है?
              </a>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-400">
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Instant trial</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> हर स्कूल का अपना portal</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> कोई setup फीस नहीं</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────── */}
      <section id="features" className="border-y border-slate-800/60 bg-slate-900/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">एक पोर्टल में सब कुछ</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
            स्कूल चलाने की हर व्यवस्था — डिजिटल, सुरक्षित और आसान।
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-indigo-500/50 hover:bg-slate-900"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600/15 text-indigo-400">
                  <f.icon className="h-5.5 w-5.5" />
                </span>
                <h3 className="mt-4 text-base font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────── */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">3 सरल चरण</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
          बिना किसी फ़ॉर्मेलिटी के — आज ही अपना स्कूल मैनेजमेंट शुरू करें।
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.title} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg shadow-indigo-900/40">
                <s.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-base font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Portfolio ───────────────────────────────────────── */}
      <section id="portfolio" className="border-y border-slate-800/60 bg-slate-900/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">पोर्टफोलियो — हमारे स्कूल</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
            ये स्कूल पहले से अपने निजी पोर्टल पर Pragnya Mitra उपयोग कर रहे हैं।
          </p>
          {schools.length > 0 ? (
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {schools.map((s) => (
                <a
                  key={s.slug}
                  href={'https://' + s.domain}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-indigo-500/50 hover:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600/15 text-violet-400">
                      <School className="h-5.5 w-5.5" />
                    </span>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                      Live
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-bold">{s.name}</h3>
                  <p className="mt-1 truncate text-sm text-slate-400 group-hover:text-indigo-300">{s.domain}</p>
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-12 text-center text-sm text-slate-500">जल्द ही और स्कूल जुड़ेंगे।</p>
          )}
          <p className="mt-10 text-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:from-indigo-500 hover:to-violet-500"
            >
              आपका स्कूल अगला बने — अभी रजिस्टर करें <ArrowRight className="h-4 w-4" />
            </Link>
          </p>
        </div>
      </section>

      {/* ── Plans ───────────────────────────────────────────── */}
      <section id="plans" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">सरल योजनाएं</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
          ट्रायल से शुरू करें — बाद में अपनी ज़रूरत की योजना चुनें।
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={
                'relative rounded-2xl border p-6 ' +
                (p.highlight
                  ? 'border-indigo-500 bg-indigo-950/40 shadow-xl shadow-indigo-950/50'
                  : 'border-slate-800 bg-slate-900/60')
              }
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-0.5 text-[11px] font-bold text-white">
                  सबसे लोकप्रिय
                </span>
              )}
              <h3 className="text-sm font-bold">{p.name}</h3>
              <p className="mt-3 text-2xl font-extrabold">{p.price}</p>
              <p className="text-xs text-slate-500">{p.per}</p>
              <p className="mt-3 text-sm text-slate-400">{p.desc}</p>
              <Link
                href="/register"
                className={
                  'mt-5 block rounded-xl py-2.5 text-center text-sm font-semibold transition ' +
                  (p.highlight
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500'
                    : 'border border-slate-700 text-slate-200 hover:border-slate-500 hover:bg-slate-900')
                }
              >
                शुरू करें
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA / Footer ────────────────────────────────────── */}
      <footer className="border-t border-slate-800/60 bg-slate-900/40">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">आज ही अपना स्कूल पोर्टल शुरू करें</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-400">
              7-दिन FREE TRIAL — बिना किसी शुल्क के पूरे प्लेटफ़ॉर्म का अनुभव लें।
            </p>
            <Link
              href="/register"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-3.5 text-base font-bold text-white shadow-xl shadow-indigo-900/40 transition hover:from-indigo-500 hover:to-violet-500"
            >
              स्कूल रजिस्टर करें <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-800/60 pt-8 text-sm text-slate-500 sm:flex-row">
            <span>© {new Date().getFullYear()} Pragnya Mitra · Nava Sanganakah Multiventures</span>
            <div className="flex flex-wrap items-center gap-5">
              <a href="#features" className="hover:text-slate-300">विशेषताएं</a>
              <a href="#portfolio" className="hover:text-slate-300">पोर्टफोलियो</a>
              <a href="#plans" className="hover:text-slate-300">योजनाएं</a>
              <a href="https://admin.pragnya.nasven.com" className="hover:text-slate-300">प्रशासक लॉगिन</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}