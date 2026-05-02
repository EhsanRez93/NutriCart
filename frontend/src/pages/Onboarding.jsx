import { useState } from 'react'

const steps = [
  { id: 1, question: "What's your name?",          field: 'name',          type: 'text',   placeholder: 'e.g. Peter',  icon: '👤' },
  { id: 2, question: "What is your current weight?", field: 'currentWeight', type: 'number', placeholder: 'kg, e.g. 60', icon: '⚖️' },
  { id: 3, question: "What is your target weight?",  field: 'targetWeight',  type: 'number', placeholder: 'kg, e.g. 70', icon: '🎯' },
  { id: 4, question: "How tall are you?",            field: 'height',        type: 'number', placeholder: 'cm, e.g. 175', icon: '📏' },
  { id: 5, question: "How old are you?",             field: 'age',           type: 'number', placeholder: 'years, e.g. 35', icon: '🎂' },
]

const goals    = ['Gain weight', 'Lose weight', 'Build muscle', 'Eat healthier', 'Manage a condition']
const symptoms = ['Fatigue / low energy', 'Poor sleep', 'Digestive issues', 'Frequent illness', 'Brain fog', 'None of these']
const stores   = ['Lidl', 'Kaufland', 'Billa', 'Tesco', 'Spar', 'Aldi', 'Penny', 'Other']

const COUNTRIES = [
  'Slovakia', 'Czech Republic', 'Austria', 'Hungary', 'Germany', 'Poland',
  'Romania', 'Bulgaria', 'Croatia', 'Slovenia', 'United Kingdom', 'Ireland',
  'France', 'Italy', 'Spain', 'Portugal', 'Netherlands', 'Belgium',
  'Sweden', 'Norway', 'Denmark', 'Finland', 'Other',
]

const GOAL_ICONS = {
  'Gain weight':        '📈',
  'Lose weight':        '📉',
  'Build muscle':       '💪',
  'Eat healthier':      '🥗',
  'Manage a condition': '🏥',
}

const SYMPTOM_ICONS = {
  'Fatigue / low energy': '⚡',
  'Poor sleep':           '🌙',
  'Digestive issues':     '🫁',
  'Frequent illness':     '🛡️',
  'Brain fog':            '🧠',
  'None of these':        '✅',
}

const STORE_ICONS = {
  'Lidl':     '🟡',
  'Kaufland': '🔴',
  'Billa':    '🟠',
  'Tesco':    '🔵',
  'Spar':     '🟢',
  'Aldi':     '🟤',
  'Penny':    '🔴',
  'Other':    '🏪',
}

const HOLIDAY_MODE_LABELS = {
  festive: { icon: '🎉', label: 'Festive meals', desc: 'Suggest traditional holiday foods on public holidays' },
  normal:  { icon: '🍽️', label: 'Normal meals',  desc: 'Treat public holidays like any other day' },
  skip:    { icon: '⊘',  label: 'Rest day',      desc: 'Mark public holidays as light / rest days' },
}

// Total steps: basic inputs + goal + symptoms + stores + country + holiday mode
const EXTRA_STEPS = 5

export default function Onboarding({ onComplete }) {
  const [step, setStep]       = useState(0)
  const [profile, setProfile] = useState({})
  const [done, setDone]       = useState(false)

  const totalSteps = steps.length + EXTRA_STEPS
  const progress   = Math.round(((step + 1) / totalSteps) * 100)

  function handleNext(value) {
    const updated = { ...profile }

    if (step < steps.length) {
      updated[steps[step].field] = value
    } else if (step === steps.length) {
      updated.goal = value
    } else if (step === steps.length + 1) {
      updated.symptoms = value
    } else if (step === steps.length + 2) {
      updated.store = value
    } else if (step === steps.length + 3) {
      updated.country = value
      // If 'Other', skip holiday mode and default to 'normal'
      if (value === 'Other') {
        updated.holidayMode = 'normal'
        setProfile(updated)
        setDone(true)
        if (onComplete) onComplete(updated)
        return
      }
    } else if (step === steps.length + 4) {
      updated.holidayMode = value
    }

    setProfile(updated)

    if (step + 1 >= totalSteps) {
      setDone(true)
      if (onComplete) onComplete(updated)
    } else {
      setStep(s => s + 1)
    }
  }

  function handleBack() {
    if (step > 0) setStep(s => s - 1)
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center px-6">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-extrabold text-gray-800 mb-3">
            Your plan is being built, {profile.name}!
          </h2>
          <p className="text-gray-500 mb-6">
            We're calculating your personal nutrition targets based on your profile.
          </p>
          <div className="bg-green-50 rounded-2xl p-4 text-left mb-6 space-y-1">
            {[
              { label: 'Goal',       value: profile.goal },
              { label: 'Weight',     value: `${profile.currentWeight}kg → ${profile.targetWeight}kg` },
              { label: 'Height',     value: `${profile.height}cm` },
              { label: 'Age',        value: profile.age },
              { label: 'Country',    value: profile.country },
              { label: 'Symptoms',   value: Array.isArray(profile.symptoms) ? profile.symptoms.join(', ') : profile.symptoms },
              { label: 'Stores',     value: Array.isArray(profile.store) ? profile.store.join(', ') : profile.store },
            ].map((item, i) => (
              <p key={i} className="text-sm text-gray-600">
                <span className="font-semibold">{item.label}:</span> {item.value}
              </p>
            ))}
          </div>
          {profile.holidayMode && (
            <div className="bg-amber-50 rounded-xl p-3 mb-4 text-xs text-amber-700 text-left flex items-center gap-2">
              <span className="text-base">{HOLIDAY_MODE_LABELS[profile.holidayMode]?.icon}</span>
              <span>Holiday mode: <span className="font-bold">{HOLIDAY_MODE_LABELS[profile.holidayMode]?.label}</span> — {HOLIDAY_MODE_LABELS[profile.holidayMode]?.desc}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  const currentStepInfo = step < steps.length ? steps[step] : null
  const stepLabel = step < steps.length
    ? `${step + 1} of ${totalSteps}`
    : step === steps.length     ? `${step + 1} of ${totalSteps} — Your Goal`
    : step === steps.length + 1 ? `${step + 1} of ${totalSteps} — Health`
    : step === steps.length + 2 ? `${step + 1} of ${totalSteps} — Stores`
    : step === steps.length + 3 ? `${step + 1} of ${totalSteps} — Location`
    : `${step + 1} of ${totalSteps} — Holidays`

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center px-6 py-8">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛒</span>
            <span className="font-bold text-green-700">NutriCart</span>
          </div>
          <span className="text-xs text-gray-400 font-semibold">{stepLabel}</span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-2 mb-6">
          <div className="bg-green-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }} />
        </div>

        {/* Step icon */}
        {currentStepInfo && (
          <div className="text-4xl mb-3 text-center">{currentStepInfo.icon}</div>
        )}

        {/* Basic input steps */}
        {step < steps.length && (
          <StepInput key={step} step={steps[step]} onNext={handleNext} />
        )}

        {/* Goal */}
        {step === steps.length && (
          <StepChoice
            key="goal"
            question="What is your main goal?"
            options={goals}
            icons={GOAL_ICONS}
            multi={false}
            onNext={handleNext}
          />
        )}

        {/* Symptoms */}
        {step === steps.length + 1 && (
          <StepChoice
            key="symptoms"
            question="Do you experience any of these?"
            subtext="Select all that apply — we'll adjust your plan accordingly"
            options={symptoms}
            icons={SYMPTOM_ICONS}
            multi={true}
            onNext={handleNext}
          />
        )}

        {/* Stores */}
        {step === steps.length + 2 && (
          <StepChoice
            key="store"
            question="Which stores do you shop at?"
            subtext="Select all that apply — we'll match products to your stores"
            options={stores}
            icons={STORE_ICONS}
            multi={true}
            onNext={handleNext}
          />
        )}

        {/* Country */}
        {step === steps.length + 3 && (
          <StepCountry
            key="country"
            onNext={handleNext}
          />
        )}

        {/* Holiday mode */}
        {step === steps.length + 4 && (
          <StepHolidayMode
            key="holidayMode"
            country={profile.country}
            onNext={handleNext}
          />
        )}

        {/* Back button */}
        {step > 0 && (
          <button onClick={handleBack}
            className="mt-4 w-full text-gray-400 text-sm font-semibold hover:text-gray-600 transition py-2">
            ← Back
          </button>
        )}

      </div>
    </div>
  )
}

// ── Input Step ────────────────────────────────
function StepInput({ step, onNext }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  function validate() {
    if (!value) { setError('Please enter a value'); return false }
    if (step.type === 'number') {
      const n = parseFloat(value)
      if (isNaN(n) || n <= 0) { setError('Please enter a valid number'); return false }
      if (step.field === 'currentWeight' && (n < 30 || n > 300)) { setError('Please enter a valid weight (30–300kg)'); return false }
      if (step.field === 'targetWeight'  && (n < 30 || n > 300)) { setError('Please enter a valid weight (30–300kg)'); return false }
      if (step.field === 'height'        && (n < 100 || n > 250)) { setError('Please enter a valid height (100–250cm)'); return false }
      if (step.field === 'age'           && (n < 10 || n > 120))  { setError('Please enter a valid age (10–120)'); return false }
    }
    return true
  }

  function handleSubmit() {
    if (validate()) onNext(value)
  }

  return (
    <div>
      <h2 className="text-2xl font-extrabold text-gray-800 mb-6 text-center">{step.question}</h2>
      <input
        type={step.type}
        placeholder={step.placeholder}
        value={value}
        onChange={e => { setValue(e.target.value); setError('') }}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        autoFocus
        className={`w-full border-2 rounded-xl px-4 py-3 text-lg focus:outline-none mb-2 text-center
          ${error ? 'border-red-400 focus:border-red-400' : 'border-gray-200 focus:border-green-500'}`}
      />
      {error && <p className="text-red-500 text-xs mb-3 text-center">{error}</p>}
      {!error && <div className="mb-4" />}
      <button onClick={handleSubmit} disabled={!value}
        className="bg-green-600 text-white px-8 py-3 rounded-full font-bold w-full hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
        Continue →
      </button>
    </div>
  )
}

// ── Choice Step ───────────────────────────────
function StepChoice({ question, subtext, options, icons, multi, onNext }) {
  const [selected, setSelected] = useState([])

  function toggle(opt) {
    if (!multi) { onNext(opt); return }
    setSelected(prev =>
      prev.includes(opt) ? prev.filter(s => s !== opt) : [...prev, opt]
    )
  }

  return (
    <div>
      <h2 className="text-xl font-extrabold text-gray-800 mb-1">{question}</h2>
      {subtext && <p className="text-xs text-gray-400 mb-4">{subtext}</p>}
      {!subtext && <div className="mb-4" />}

      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
        {options.map((opt, i) => (
          <button key={i} onClick={() => toggle(opt)}
            className={`border-2 rounded-xl px-4 py-3 text-left font-medium transition flex items-center gap-3
              ${selected.includes(opt)
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 text-gray-700 hover:border-green-400 hover:bg-green-50'}`}>
            <span className="text-lg flex-shrink-0">{icons?.[opt] || '○'}</span>
            <span>{opt}</span>
            {multi && selected.includes(opt) && <span className="ml-auto text-green-600 font-bold">✓</span>}
          </button>
        ))}
      </div>

      {multi && (
        <button onClick={() => selected.length > 0 && onNext(selected)}
          disabled={selected.length === 0}
          className="mt-4 bg-green-600 text-white px-8 py-3 rounded-full font-bold w-full hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
          Confirm ({selected.length} selected) →
        </button>
      )}
    </div>
  )
}

// ── Country Step ──────────────────────────────
function StepCountry({ onNext }) {
  const [selected, setSelected]   = useState('')
  const [search, setSearch]       = useState('')

  const filtered = COUNTRIES.filter(c =>
    c.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <h2 className="text-xl font-extrabold text-gray-800 mb-1">Which country do you live in?</h2>
      <p className="text-xs text-gray-400 mb-4">Used to adjust your shopping plan around local holidays</p>

      <input
        type="text"
        placeholder="Search country..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border-2 border-gray-200 rounded-xl px-4 py-2 text-sm focus:border-green-500 focus:outline-none mb-3"
      />

      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
        {filtered.map((country, i) => (
          <button key={i} onClick={() => setSelected(country)}
            className={`border-2 rounded-xl px-4 py-2.5 text-left font-medium transition flex items-center gap-2
              ${selected === country
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 text-gray-700 hover:border-green-400 hover:bg-green-50'}`}>
            <span>🌍</span>
            <span className="text-sm">{country}</span>
            {selected === country && <span className="ml-auto text-green-600 font-bold">✓</span>}
          </button>
        ))}
      </div>

      <button onClick={() => selected && onNext(selected)}
        disabled={!selected}
        className="mt-4 bg-green-600 text-white px-8 py-3 rounded-full font-bold w-full hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
        Continue →
      </button>
    </div>
  )
}

// ── Holiday Mode Step ─────────────────────────
function StepHolidayMode({ country, onNext }) {
  const [selected, setSelected] = useState('')
  const modes = [
    { value: 'festive', icon: '🎉', label: 'Festive meals',  desc: 'Suggest traditional / celebratory foods on public holidays' },
    { value: 'normal',  icon: '🍽️', label: 'Normal meals',   desc: 'Treat public holidays like any other day' },
    { value: 'skip',    icon: '⊘',  label: 'Rest day',       desc: 'Mark public holidays as light / rest days' },
  ]
  return (
    <div>
      <h2 className="text-xl font-extrabold text-gray-800 mb-1">
        🎉 Holiday handling for {country}
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        How should the AI treat public holidays in your meal plan?
      </p>
      <div className="flex flex-col gap-3">
        {modes.map(m => (
          <button key={m.value} onClick={() => setSelected(m.value)}
            className={`border-2 rounded-xl px-4 py-3 text-left transition flex items-start gap-3
              ${selected === m.value
                ? 'border-amber-400 bg-amber-50 text-amber-800'
                : 'border-gray-200 text-gray-700 hover:border-amber-300 hover:bg-amber-50'}`}>
            <span className="text-2xl flex-shrink-0 mt-0.5">{m.icon}</span>
            <div>
              <p className="font-bold text-sm">{m.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
            </div>
            {selected === m.value && <span className="ml-auto text-amber-500 font-bold text-lg">✓</span>}
          </button>
        ))}
      </div>
      <button onClick={() => selected && onNext(selected)}
        disabled={!selected}
        className="mt-4 bg-green-600 text-white px-8 py-3 rounded-full font-bold w-full hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
        Continue →
      </button>
    </div>
  )
}