import { useState } from 'react'
import posthog from 'posthog-js'
import { supabase } from '../supabase'

export default function Auth({ onAuth }) {
  const [mode, setMode]       = useState('login')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [success, setSuccess] = useState(null)

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        posthog.identify(data.user?.id, { email })
        posthog.capture('user_signed_up', { email })
        setSuccess('Account created! Please check your email to confirm, then log in.')
        setMode('login')
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        posthog.identify(data.user.id, { email })
        posthog.capture('user_logged_in', { email })
        onAuth(data.user)
      }
    } catch (err) {
      posthog.capture('login_failed', { mode, error: err.message })
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center px-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full">

        {/* Header */}
        <div className="flex items-center gap-2 mb-8">
          <img src="/logo-icon.svg" alt="NutriCart" className="h-10 w-10" />
          <span className="font-bold text-green-700 text-xl">NutriCart</span>
        </div>

        <h2 className="text-2xl font-extrabold text-gray-800 mb-2">
          {mode === 'login' ? 'Welcome back!' : 'Create your account'}
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          {mode === 'login'
            ? 'Log in to access your personalized nutrition plan'
            : 'Start your personalized nutrition journey'}
        </p>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 mb-4 text-sm">
            ✅ {success}
          </div>
        )}

        {/* Email */}
        <div className="mb-4">
          <label className="text-sm font-semibold text-gray-700 mb-1 block">Email</label>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
          />
        </div>

        {/* Password */}
        <div className="mb-6">
          <label className="text-sm font-semibold text-gray-700 mb-1 block">Password</label>
          <input
            type="password"
            placeholder="minimum 6 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || !email || !password}
          className="bg-green-600 text-white px-8 py-3 rounded-full font-bold w-full hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed mb-4">
          {loading ? '⏳ Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
        </button>

        {/* Toggle */}
        <p className="text-center text-sm text-gray-500">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
            className="text-green-600 font-bold hover:underline">
            {mode === 'login' ? 'Sign up free' : 'Log in'}
          </button>
        </p>

      </div>
    </div>
  )
}