import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import NutritionPlan from './pages/NutritionPlan'

export default function App() {
  const [page, setPage]               = useState('landing')
  const [user, setUser]               = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        loadProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
      } else {
        setUser(null)
        setUserProfile(null)
        setPage('landing')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data && !error) {
      const profile = {
        name:              data.name,
        currentWeight:     data.current_weight,
        targetWeight:      data.target_weight,
        height:            data.height,
        age:               data.age,
        goal:              data.goal,
        symptoms:          data.symptoms,
        store:             data.store,
        calories:          data.calories,
        protein:           data.protein,
        carbs:             data.carbs,
        fats:              data.fats,
        country:           data.country,
        holidayMode:       data.holiday_mode || 'festive',
        savedMealPlan:     data.saved_meal_plan || null,
        mealPlanStartDate: data.meal_plan_start_date || null,
        planGeneratedAt:   data.plan_generated_at || null,
        cachedInsights:    data.cached_insights || null,
        insightsGeneratedAt: data.insights_generated_at || null,
      }
      setUserProfile(profile)
      setPage('plan')
    } else {
      setPage('onboarding')
    }
    setLoading(false)
  }

  async function handleOnboardingComplete(profile) {
    const nutrition   = calculateNutrition(profile)
    const fullProfile = { ...profile, ...nutrition }
    setUserProfile(fullProfile)

    if (user) {
      await supabase.from('profiles').upsert({
        id:             user.id,
        name:           profile.name,
        current_weight: parseFloat(profile.currentWeight),
        target_weight:  parseFloat(profile.targetWeight),
        height:         parseFloat(profile.height),
        age:            parseFloat(profile.age),
        goal:           profile.goal,
        symptoms:       profile.symptoms,
        store:          profile.store,
        country:        profile.country || 'Slovakia',
        holiday_mode:   profile.holidayMode || 'festive',
        calories:       nutrition.calories,
        protein:        nutrition.protein,
        carbs:          nutrition.carbs,
        fats:           nutrition.fats,
      })
    }

    setPage('plan')
  }

  async function handleSaveMealPlan(mealPlan, startDate) {
    if (!user) return
    await supabase.from('profiles').update({
      saved_meal_plan:     mealPlan,
      meal_plan_start_date: startDate,
      plan_generated_at:   new Date().toISOString(),
    }).eq('id', user.id)

    setUserProfile(prev => ({
      ...prev,
      savedMealPlan:     mealPlan,
      mealPlanStartDate: startDate,
      planGeneratedAt:   new Date().toISOString(),
    }))
  }

  async function handleUpdateGoals(updatedGoals) {
    if (!user) return
    const nutrition = calculateNutrition({ ...userProfile, ...updatedGoals })
    await supabase.from('profiles').update({
      current_weight: parseFloat(updatedGoals.currentWeight),
      target_weight:  parseFloat(updatedGoals.targetWeight),
      goal:           updatedGoals.goal,
      holiday_mode:   updatedGoals.holidayMode || userProfile.holidayMode || 'festive',
      calories:       nutrition.calories,
      protein:        nutrition.protein,
      carbs:          nutrition.carbs,
      fats:           nutrition.fats,
    }).eq('id', user.id)

    setUserProfile(prev => ({
      ...prev,
      ...updatedGoals,
      ...nutrition,
    }))
  }

  async function handleAuth(user) {
    setUser(user)
    await loadProfile(user.id)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setPage('landing')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🛒</div>
          <p className="text-green-700 font-bold text-xl">Loading NutriCart...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {page === 'landing'    && <Landing onStart={() => setPage('auth')} />}
      {page === 'auth'       && <Auth onAuth={handleAuth} />}
      {page === 'onboarding' && <Onboarding onComplete={handleOnboardingComplete} />}
      {page === 'plan'       && userProfile && (
        <NutritionPlan
          profile={userProfile}
          onBack={() => setPage('onboarding')}
          onSignOut={handleSignOut}
          onSaveMealPlan={handleSaveMealPlan}
          onUpdateGoals={handleUpdateGoals}
          userId={user?.id}
        />
      )}
    </div>
  )
}

function calculateNutrition(profile) {
  const weight = parseFloat(profile.currentWeight)
  const target = parseFloat(profile.targetWeight)
  const height = parseFloat(profile.height)
  const age    = parseFloat(profile.age)
  const goal   = profile.goal || 'Eat healthier'
  const bmr    = (10 * weight) + (6.25 * height) - (5 * age) + 5
  const tdee   = Math.round(bmr * 1.375)
  let calories = tdee
  if (goal === 'Gain weight' || goal === 'Build muscle') calories = tdee + 500
  if (goal === 'Lose weight') calories = tdee - 500
  const protein      = Math.round(target * 2)
  const fats         = Math.round((calories * 0.25) / 9)
  const carbs        = Math.round((calories - (protein * 4) - (fats * 9)) / 4)
  const weightDiff   = Math.abs(target - weight)
  const weeksNeeded  = Math.round(weightDiff / 0.5)
  const monthsNeeded = Math.round(weeksNeeded / 4)
  return { calories, protein, carbs, fats, bmr: Math.round(bmr), tdee, weeksNeeded, monthsNeeded }
}