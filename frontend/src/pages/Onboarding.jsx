import { useState } from 'react'

const steps = [
  { id: 1, question: "What's your name?", field: 'name', type: 'text', placeholder: 'e.g. Peter' },
  { id: 2, question: "What is your current weight?", field: 'currentWeight', type: 'number', placeholder: 'kg, e.g. 60' },
  { id: 3, question: "What is your target weight?", field: 'targetWeight', type: 'number', placeholder: 'kg, e.g. 70' },
  { id: 4, question: "How tall are you?", field: 'height', type: 'number', placeholder: 'cm, e.g. 175' },
  { id: 5, question: "How old are you?", field: 'age', type: 'number', placeholder: 'years, e.g. 35' },
]

const goals = ['Gain weight', 'Lose weight', 'Build muscle', 'Eat healthier', 'Manage a condition']
const symptoms = ['Fatigue / low energy', 'Poor sleep', 'Digestive issues', 'Frequent illness', 'Brain fog', 'None of these']
const stores = ['Lidl', 'Kaufland', 'Billa', 'Tesco', 'Spar', 'Aldi', 'Penny', 'Other']

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState({})
  const [done, setDone] = useState(false)

  const totalSteps = steps.length + 3
  const progress = Math.round((step / totalSteps) * 100)

  function handleNext(value) {
    let updatedProfile = { ...profile }

    if (step < steps.length) {
      updatedProfile[steps[step].field] = value
    } else if (step === steps.length) {
      updatedProfile.goal = value
    } else if (step === steps.length + 1) {
      updatedProfile.symptoms = value
    } else if (step === steps.length + 2) {
      updatedProfile.store = value
    }

    setProfile(updatedProfile)

    if (step + 1 >= totalSteps) {
      setDone(true)
      if (onComplete) onComplete(updatedProfile)
    } else {
      setStep(s => s + 1)
    }
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
            We're calculating your personal nutrition targets and building your first weekly meal plan.
          </p>
          <div className="bg-green-50 rounded-2xl p-4 text-left mb-6 space-y-1">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">Goal:</span> {profile.goal}
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-semibold">Weight:</span> {profile.currentWeight}kg → {profile.targetWeight}kg
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-semibold">Height:</span> {profile.height}cm
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-semibold">Age:</span> {profile.age}
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-semibold">Symptoms:</span>{' '}
              {Array.isArray(profile.symptoms) ? profile.symptoms.join(', ') : profile.symptoms}
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-semibold">Preferred stores:</span>{' '}
              {Array.isArray(profile.store) ? profile.store.join(', ') : profile.store}
            </p>
          </div>
          <button className="bg-green-600 text-white px-8 py-3 rounded-full font-bold w-full hover:bg-green-700 transition">
            View My Nutrition Plan →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center px-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full">

        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xl">🛒</span>
          <span className="font-bold text-green-700">NutriCart</span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
          <div
            className="bg-green-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mb-6">Step {step + 1} of {totalSteps}</p>

        {/* Step: Basic text/number inputs */}
        {step < steps.length && (
          <StepInput
            key={step}
            step={steps[step]}
            onNext={handleNext}
          />
        )}

        {/* Step: Goal — single select */}
        {step === steps.length && (
          <StepChoice
            key="goal"
            question="What is your main goal?"
            options={goals}
            multi={false}
            onNext={handleNext}
          />
        )}

        {/* Step: Symptoms — multi select */}
        {step === steps.length + 1 && (
          <StepChoice
            key="symptoms"
            question="Do you experience any of these?"
            subtext="Select all that apply"
            options={symptoms}
            multi={true}
            onNext={handleNext}
          />
        )}

        {/* Step: Store — multi select */}
        {step === steps.length + 2 && (
          <StepChoice
            key="store"
            question="Which stores do you shop at?"
            subtext="Select all that apply"
            options={stores}
            multi={true}
            onNext={handleNext}
          />
        )}

      </div>
    </div>
  )
}

// ── Input Step (text / number) ──────────────────────
function StepInput({ step, onNext }) {
  const [value, setValue] = useState('')

  return (
    <div>
      <h2 className="text-2xl font-extrabold text-gray-800 mb-6">{step.question}</h2>
      <input
        type={step.type}
        placeholder={step.placeholder}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && value && onNext(value)}
        autoFocus
        className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg focus:border-green-500 focus:outline-none mb-6"
      />
      <button
        onClick={() => value && onNext(value)}
        disabled={!value}
        className="bg-green-600 text-white px-8 py-3 rounded-full font-bold w-full hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
        Continue →
      </button>
    </div>
  )
}

// ── Choice Step (single or multi select) ───────────
function StepChoice({ question, subtext, options, multi, onNext }) {
  const [selected, setSelected] = useState([])

  function toggle(opt) {
    if (!multi) {
      onNext(opt)
      return
    }
    setSelected(prev =>
      prev.includes(opt)
        ? prev.filter(s => s !== opt)
        : [...prev, opt]
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-extrabold text-gray-800 mb-1">{question}</h2>
      {subtext && <p className="text-sm text-gray-400 mb-4">{subtext}</p>}
      {!subtext && <div className="mb-4" />}

      <div className="flex flex-col gap-3">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => toggle(opt)}
            className={`border-2 rounded-xl px-4 py-3 text-left font-medium transition
              ${selected.includes(opt)
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 text-gray-700 hover:border-green-400 hover:bg-green-50'
              }`}>
            <span className="mr-2">{selected.includes(opt) ? '✅' : '○'}</span>
            {opt}
          </button>
        ))}
      </div>

      {/* Multi-select confirm button */}
      {multi && (
        <button
          onClick={() => selected.length > 0 && onNext(selected)}
          disabled={selected.length === 0}
          className="mt-6 bg-green-600 text-white px-8 py-3 rounded-full font-bold w-full hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
          Confirm ({selected.length} selected) →
        </button>
      )}
    </div>
  )
}