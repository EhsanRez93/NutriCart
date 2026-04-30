import { useState } from 'react'
import Landing from './pages/Landing'
import Onboarding from './pages/Onboarding'
import NutritionPlan from './pages/NutritionPlan'

export default function App() {
  const [page, setPage] = useState('landing')
  const [userProfile, setUserProfile] = useState(null)

  function handleOnboardingComplete(profile) {
    setUserProfile(profile)
    setPage('plan')
  }

  return (
    <div>
      {page === 'landing' && (
        <Landing onStart={() => setPage('onboarding')} />
      )}
      {page === 'onboarding' && (
        <Onboarding onComplete={handleOnboardingComplete} />
      )}
      {page === 'plan' && userProfile && (
        <NutritionPlan profile={userProfile} onBack={() => setPage('onboarding')} />
      )}
    </div>
  )
}