import { useTranslation } from 'react-i18next';
import { Check, Mail } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

interface PlanFeature {
  text: string;
  highlight?: boolean;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  priceSub: string;
  tagline: string;
  features: PlanFeature[];
  cta: string;
  ctaHref: string;
  badge?: string;
  highlighted?: boolean;
}

// ─── Data ────────────────────────────────────────────────────

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '350 OMR',
    priceSub: 'per school / year',
    tagline: 'For small independent schools starting their OAAAQA journey',
    features: [
      { text: 'Full OAAAQA framework (all 5 domains)' },
      { text: 'Self-evaluation tools' },
      { text: 'Improvement plan' },
      { text: 'Basic evidence upload (500 MB)' },
      { text: 'Up to 10 staff users' },
      { text: 'Email support' },
    ],
    cta: 'Get started →',
    ctaHref: 'mailto:hello@asabya.com?subject=Madrasa Comply Starter Enquiry',
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '650 OMR',
    priceSub: 'per school / year',
    tagline: 'For schools ready to drive data-led improvement',
    features: [
      { text: 'Everything in Starter' },
      { text: 'AI-assisted SED generation' },
      { text: 'Classroom observation tools' },
      { text: 'Teacher appraisal cycle' },
      { text: 'Survey tools (staff, parent, student)' },
      { text: 'Performance data & proficiency reports' },
      { text: 'Unlimited users' },
      { text: '5 GB evidence storage' },
    ],
    cta: 'Get started →',
    ctaHref: 'mailto:hello@asabya.com?subject=Madrasa Comply Professional Enquiry',
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '950 OMR',
    priceSub: 'per school / year',
    tagline: 'For schools wanting full readiness and benchmarking',
    highlighted: true,
    badge: 'Most popular',
    features: [
      { text: 'Everything in Professional' },
      { text: 'Benchmarking module', highlight: true },
      { text: 'SED diff viewer (year-on-year comparison)' },
      { text: 'HOD domain scoping' },
      { text: 'CPD log & coaching notes' },
      { text: 'Custom reports & PDF export' },
      { text: 'Audit prep checklist' },
      { text: 'Priority support' },
      { text: 'Unlimited evidence storage' },
    ],
    cta: 'Get started →',
    ctaHref: 'mailto:hello@asabya.com?subject=Madrasa Comply Premium Enquiry',
  },
  {
    id: 'chain',
    name: 'Chain',
    price: '1,200 OMR',
    priceSub: 'per school / year',
    tagline: 'For school group operators (2–20 campuses)',
    features: [
      { text: 'Everything in Premium', highlight: true },
      { text: 'Unlimited schools in group' },
      { text: 'Cross-school benchmarking' },
      { text: 'Push improvement templates to all schools' },
      { text: 'Group-level analytics dashboard' },
      { text: 'Chain admin role' },
      { text: 'Dedicated account manager' },
    ],
    cta: 'Contact us →',
    ctaHref: 'mailto:hello@asabya.com?subject=Madrasa Comply Chain Enquiry',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    priceSub: '20+ schools',
    tagline: 'For large school groups and government bodies',
    features: [
      { text: 'Everything in Chain' },
      { text: 'Custom integrations' },
      { text: 'On-site training & onboarding' },
      { text: 'SLA guarantee' },
      { text: 'Ministry-level reporting' },
      { text: 'White-label option' },
    ],
    cta: 'Contact us →',
    ctaHref: 'mailto:hello@asabya.com?subject=Madrasa Comply Enterprise Enquiry',
  },
];

// ─── Volume discount table ─────────────────────────────────────

const CHAIN_VOLUMES = [
  { range: '2–4 schools',  price: '1,200 OMR/school/yr', savings: null },
  { range: '5–9 schools',  price: '1,000 OMR/school/yr', savings: 'Save 200 OMR/school' },
  { range: '10–20 schools', price: '850 OMR/school/yr',  savings: 'Save 350 OMR/school' },
  { range: '20+ schools',   price: 'Enterprise pricing', savings: 'Contact us' },
];

// ─── Consulting bundles ────────────────────────────────────────

interface Bundle {
  name: string;
  includes: string;
  originalPrice: string;
  bundlePrice: string;
  saving: string;
  cta: string;
  ctaHref: string;
}

const BUNDLES: Bundle[] = [
  {
    name: 'Starter Bundle',
    includes: 'Starter licence (1 yr) + Initial QA Setup Workshop (half day)',
    originalPrice: '700 OMR',
    bundlePrice: '550 OMR',
    saving: 'Save 150 OMR',
    cta: 'Enquire →',
    ctaHref: 'mailto:hello@asabya.com?subject=Starter Bundle Enquiry',
  },
  {
    name: 'Professional Bundle',
    includes: 'Professional licence (1 yr) + SEF Writing Workshop + 2 coaching sessions',
    originalPrice: '1,100 OMR',
    bundlePrice: '900 OMR',
    saving: 'Save 200 OMR',
    cta: 'Enquire →',
    ctaHref: 'mailto:hello@asabya.com?subject=Professional Bundle Enquiry',
  },
  {
    name: 'Chain Starter Bundle',
    includes: 'Chain licence for 3 schools (1 yr) + Chain QA Audit per school',
    originalPrice: '6,000 OMR',
    bundlePrice: '4,400 OMR',
    saving: 'Save 1,600 OMR',
    cta: 'Enquire →',
    ctaHref: 'mailto:hello@asabya.com?subject=Chain Starter Bundle',
  },
];

// ─── Components ───────────────────────────────────────────────

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div className={`relative flex flex-col rounded-2xl border p-6 ${
      plan.highlighted
        ? 'border-[#01696f] bg-[#01696f] text-white shadow-xl shadow-[#01696f]/20'
        : 'border-gray-200 bg-white'
    }`}>
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full shadow">
            {plan.badge}
          </span>
        </div>
      )}

      <div className="mb-5">
        <h3 className={`text-lg font-bold mb-1 ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
          {plan.name}
        </h3>
        <p className={`text-xs mb-4 ${plan.highlighted ? 'text-white/70' : 'text-gray-500'}`}>
          {plan.tagline}
        </p>
        <div className="flex items-end gap-1.5">
          <span className={`text-3xl font-extrabold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
            {plan.price}
          </span>
          {plan.priceSub && (
            <span className={`text-xs mb-1 ${plan.highlighted ? 'text-white/70' : 'text-gray-400'}`}>
              {plan.priceSub}
            </span>
          )}
        </div>
      </div>

      <ul className="space-y-2.5 flex-1 mb-6">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check className={`h-4 w-4 shrink-0 mt-0.5 ${
              plan.highlighted ? 'text-white' : f.highlight ? 'text-[#01696f]' : 'text-gray-400'
            }`} />
            <span className={`text-sm ${
              plan.highlighted
                ? 'text-white'
                : f.highlight
                ? 'text-[#01696f] font-medium'
                : 'text-gray-600'
            }`}>
              {f.text}
            </span>
          </li>
        ))}
      </ul>

      <a
        href={plan.ctaHref}
        className={`block text-center py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors ${
          plan.highlighted
            ? 'bg-white text-[#01696f] hover:bg-gray-50'
            : 'bg-[#01696f] text-white hover:bg-[#0c4e54]'
        }`}
      >
        {plan.cta}
      </a>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function PricingPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      {/* Top bar */}
      <div className="bg-[#0c4e54] px-5 py-3 flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-white/20 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">M</span>
        </div>
        <span className="text-white text-sm font-semibold">Madrasa Comply</span>
      </div>

      <div className="max-w-6xl mx-auto px-5 py-16">

        {/* Hero */}
        <div className="text-center mb-14">
          <p className="text-xs font-semibold text-[#01696f] uppercase tracking-widest mb-2">Pricing</p>
          <h1 className="text-4xl font-extrabold text-gray-900 mb-3">
            Transparent pricing for every school
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            All prices in Omani Rial (OMR), billed annually.
            No hidden fees — cancel anytime.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 mb-16">
          {PLANS.map(plan => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>

        {/* Chain volume discount */}
        <div className="mb-16">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Chain — Volume Discounts</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Chain pricing is always higher per school than Premium — you are paying for
                multi-school coordination, not just a licence.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Schools in group</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Price per school / year</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">vs. standard rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {CHAIN_VOLUMES.map(row => (
                    <tr key={row.range} className={row.price === 'Enterprise pricing' ? 'bg-gray-50' : ''}>
                      <td className="px-6 py-3.5 font-medium text-gray-900">{row.range}</td>
                      <td className="px-6 py-3.5 text-[#01696f] font-semibold">{row.price}</td>
                      <td className="px-6 py-3.5 text-gray-400 text-xs">{row.savings ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 bg-amber-50 border-t border-amber-100">
              <p className="text-xs text-amber-800">
                Volume pricing applies to all schools in the same group, billed on a single invoice.
                Contact us to confirm the school count before invoicing.
              </p>
            </div>
          </div>
        </div>

        {/* Consulting bundles */}
        <div className="mb-16">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Consulting Bundles</h2>
            <p className="text-sm text-gray-500 mt-1">
              Combine software + professional services and save
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {BUNDLES.map(bundle => (
              <div key={bundle.name} className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col">
                <h3 className="text-base font-bold text-gray-900 mb-1">{bundle.name}</h3>
                <p className="text-xs text-gray-500 mb-4 flex-1">{bundle.includes}</p>
                <div className="flex items-end gap-3 mb-4">
                  <div>
                    <p className="text-xs text-gray-400 line-through">{bundle.originalPrice}</p>
                    <p className="text-2xl font-extrabold text-gray-900">{bundle.bundlePrice}</p>
                  </div>
                  <span className="mb-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                    {bundle.saving}
                  </span>
                </div>
                <a
                  href={bundle.ctaHref}
                  className="flex items-center justify-center gap-1.5 py-2.5 bg-[#01696f] text-white text-sm font-semibold rounded-xl hover:bg-[#0c4e54] transition-colors"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {bundle.cta}
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ / notes */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 mb-16">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Frequently asked questions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              {
                q: 'Is there a free trial?',
                a: 'Yes — all new schools start on a 30-day trial with full access to the Professional tier features. No credit card required.',
              },
              {
                q: 'Can I upgrade mid-year?',
                a: 'Absolutely. We prorate the remaining licence period. Contact us to arrange an upgrade at any time.',
              },
              {
                q: 'How does Chain pricing work for different-sized groups?',
                a: 'The per-school rate decreases as your group grows. Volume pricing applies to all schools on the same invoice — mixing tiers within a group is not supported.',
              },
              {
                q: 'What currency are prices in?',
                a: 'All prices are in Omani Rial (OMR) and include VAT where applicable. USD pricing is available on request.',
              },
            ].map(({ q, a }) => (
              <div key={q}>
                <p className="text-sm font-semibold text-gray-900 mb-1">{q}</p>
                <p className="text-sm text-gray-500">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA footer */}
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-4">
            Have a question? We respond within 1 business day.
          </p>
          <a
            href="mailto:hello@asabya.com?subject=Madrasa Comply Pricing Enquiry"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0c4e54] text-white text-sm font-semibold rounded-xl hover:bg-[#01696f] transition-colors"
          >
            <Mail className="h-4 w-4" />
            hello@asabya.com
          </a>
        </div>
      </div>
    </div>
  );
}
