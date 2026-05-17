export default function Landing({ onStart, onNavigate }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      
      {/* Navbar */}
      <nav className="flex flex-wrap justify-between items-center gap-3 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          <img src="/NutriCart.svg" alt="NutriCart" className="h-9 w-9" />
          <span className="text-xl font-bold text-green-700">NutriCart</span>
        </div>
        <button
          onClick={onStart}
          className="bg-green-600 text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-green-700 transition w-full max-w-xs text-center sm:w-auto">
          Get Started
        </button>
      </nav>

      {/* Hero */}
      <div className="flex flex-col items-center text-center px-5 sm:px-6 pt-16 pb-20">
        <div className="bg-green-100 text-green-700 text-sm font-semibold px-4 py-1 rounded-full mb-6">
          AI-Powered Nutrition + Grocery Shopping
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-800 max-w-2xl leading-tight mb-6">
          Eat right. Shop smart. <span className="text-green-600">Feel amazing.</span>
        </h1>
        <p className="text-gray-500 text-base sm:text-lg max-w-xl mb-10">
          NutriCart builds your personalized meal plan and automatically 
          finds every ingredient at your nearest Lidl, Kaufland or Billa — 
          with one-click shopping.
        </p>
        <button
          onClick={onStart}
          className="bg-green-600 text-white px-8 py-4 rounded-full text-lg font-bold hover:bg-green-700 transition shadow-lg w-full max-w-md sm:w-auto">
          Build My Nutrition Plan →
        </button>
        <p className="text-gray-400 text-sm mt-4">Free to start · No credit card needed</p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-5 sm:px-10 pb-20 max-w-5xl mx-auto">
        {[
          { icon: '🧬', title: 'Built For Your Body', desc: 'Input your goals, weight, health symptoms and we calculate your exact daily nutrition targets.' },
          { icon: '🍽️', title: 'AI Meal Planning', desc: 'Get a full weekly meal plan with recipes designed around your personal nutrition blueprint.' },
          { icon: '🛒', title: 'Real Store Products', desc: 'Every ingredient is matched to real products at Lidl, Kaufland or Billa — with live availability.' },
        ].map((f, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition">
            <div className="text-4xl mb-4">{f.icon}</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">{f.title}</h3>
            <p className="text-gray-500 text-sm">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* CTA Banner */}
      <div className="bg-green-600 text-white text-center py-14 px-5 sm:px-6">
        <h2 className="text-3xl font-extrabold mb-4">Ready to transform how you eat?</h2>
        <p className="text-green-100 mb-8">Join thousands building smarter nutrition habits with NutriCart.</p>
        <button
          onClick={onStart}
          className="bg-white text-green-700 font-bold px-8 py-4 rounded-full text-lg hover:bg-green-50 transition w-full max-w-sm mx-auto">
          Start For Free →
        </button>
      </div>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-400 text-sm space-x-4">
        <span>© 2026 NutriCart · Built with ❤️ and AI</span>
        <button onClick={() => onNavigate('privacy')} className="hover:text-green-600 transition underline">Privacy Policy</button>
        <button onClick={() => onNavigate('terms')} className="hover:text-green-600 transition underline">Terms of Service</button>
      </footer>

    </div>
  )
}