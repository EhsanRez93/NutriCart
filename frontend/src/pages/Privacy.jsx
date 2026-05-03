export default function Privacy({ onBack }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      <nav className="flex justify-between items-center px-8 py-5 border-b border-gray-100 bg-white/60 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🛒</span>
          <span className="text-xl font-bold text-green-700">NutriCart</span>
        </div>
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-green-700 text-sm font-medium transition">
          ← Back
        </button>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-14">
        <h1 className="text-4xl font-extrabold text-gray-800 mb-2">Privacy Policy</h1>
        <p className="text-gray-400 text-sm mb-10">Last updated: 3 May 2026</p>

        <div className="space-y-8 text-gray-600 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-3">1. Who We Are</h2>
            <p>NutriCart ("we", "us", "our") is an AI-powered nutrition and grocery planning service. This Privacy Policy explains how we collect, use, and protect your personal data when you use our platform at nutricart.app.</p>
            <p className="mt-2">Data controller contact: <a href="mailto:privacy@nutricart.app" className="text-green-600 hover:underline">privacy@nutricart.app</a></p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-3">2. Data We Collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Account data:</strong> Email address and password (managed by Supabase Auth).</li>
              <li><strong>Profile data:</strong> Name, age, height, weight, health goals, dietary preferences, and country.</li>
              <li><strong>Usage data:</strong> Pages visited, features used, and interactions — collected via PostHog analytics (EU region).</li>
              <li><strong>Meal & progress data:</strong> Meal plans you generate, meal logs, shopping lists, and pantry items.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-3">3. How We Use Your Data</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To create and personalise your nutrition plan and meal recommendations.</li>
              <li>To generate grocery shopping lists matched to your local store.</li>
              <li>To track your progress toward your health goals.</li>
              <li>To improve NutriCart through anonymised analytics.</li>
              <li>To communicate important service updates (no marketing emails without consent).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-3">4. Legal Basis (GDPR)</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Contract performance:</strong> Processing needed to provide the service you signed up for.</li>
              <li><strong>Legitimate interests:</strong> Analytics to improve the product (you can opt out).</li>
              <li><strong>Consent:</strong> Session replay and detailed behavioural analytics.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-3">5. Data Storage & Processors</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Supabase</strong> — database and authentication, hosted in the EU.</li>
              <li><strong>PostHog</strong> — product analytics, EU cloud (eu.posthog.com).</li>
              <li><strong>Anthropic Claude API</strong> — AI meal plan generation. Prompts may include your nutrition profile but no directly identifying information.</li>
            </ul>
            <p className="mt-2">We do not sell your data to third parties.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-3">6. Data Retention</h2>
            <p>We retain your account and profile data for as long as your account is active. You may delete your account at any time, which removes all personal data within 30 days. Analytics data is retained for 12 months.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-3">7. Your Rights (GDPR)</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Access:</strong> Request a copy of your personal data.</li>
              <li><strong>Rectification:</strong> Correct inaccurate data.</li>
              <li><strong>Erasure:</strong> Request deletion of your account and data.</li>
              <li><strong>Portability:</strong> Receive your data in a machine-readable format.</li>
              <li><strong>Objection:</strong> Opt out of analytics tracking.</li>
            </ul>
            <p className="mt-2">To exercise any of these rights, email us at <a href="mailto:privacy@nutricart.app" className="text-green-600 hover:underline">privacy@nutricart.app</a>. We will respond within 30 days.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-3">8. Cookies</h2>
            <p>We use essential cookies for authentication (Supabase session). Analytics cookies (PostHog) are used to understand how you use NutriCart. You can disable these in your browser settings.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-3">9. Changes to This Policy</h2>
            <p>We may update this policy from time to time. We will notify you of significant changes by email or an in-app notice.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-3">10. Contact</h2>
            <p>Questions about this policy? Email us at <a href="mailto:privacy@nutricart.app" className="text-green-600 hover:underline">privacy@nutricart.app</a>.</p>
          </section>

        </div>
      </div>

      <footer className="text-center py-6 text-gray-400 text-sm">
        © 2026 NutriCart · <button onClick={onBack} className="hover:text-green-600 transition">Back to home</button>
      </footer>
    </div>
  )
}
