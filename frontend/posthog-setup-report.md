<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics across both the NutriCart **frontend** (React + Vite, `posthog-js`) and **backend** (Node.js + Express, `posthog-node`).

**Frontend** (`posthog-js`) was already initialised in `src/main.jsx` with `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST`. User identification via `posthog.identify()` was already wired in `Auth.jsx` and `App.jsx`. All 12 planned frontend events were already implemented.

**New changes in this run:**
1. **`backend/server.js`** — Added `posthog-node` SDK: initialisation with `POSTHOG_KEY` / `POSTHOG_HOST`, `enableExceptionAutocapture: true`, graceful shutdown on `SIGINT`/`SIGTERM`, `posthog.capture()` in all four API routes (`/api/mealplan`, `/api/swapmeal`, `/api/replan`, `/api/insights`), and `posthog.captureException()` in every `catch` block.
2. **`backend/.env`** — Added `POSTHOG_KEY` and `POSTHOG_HOST`.
3. **`src/pages/NutritionPlan.jsx`** — Added `X-POSTHOG-DISTINCT-ID: posthog.get_distinct_id()` header to all four `fetch()` calls so backend events are correlated with the same PostHog person as client-side events.
4. **`backend/package.json`** — `posthog-node` added as a dependency.

---

| Event | Description | File |
|---|---|---|
| `user_signed_up` | User creates a new account | `src/pages/Auth.jsx` |
| `user_logged_in` | User logs in | `src/pages/Auth.jsx` |
| `login_failed` | Login / signup attempt fails | `src/pages/Auth.jsx` |
| `onboarding_completed` | User finishes onboarding | `src/pages/Onboarding.jsx` |
| `meal_plan_generated` | AI 7-day meal plan created (client + server) | `src/pages/NutritionPlan.jsx`, `backend/server.js` |
| `daily_checkin_submitted` | User submits a daily check-in | `src/pages/NutritionPlan.jsx` |
| `insights_generated` | AI nutrition insights generated (client + server) | `src/pages/NutritionPlan.jsx`, `backend/server.js` |
| `goals_updated` | User updates weight/nutrition goals | `src/App.jsx` |
| `user_signed_out` | User signs out | `src/App.jsx` |
| `ai_shopping_selection_used` | AI smart selection triggered | `src/pages/ShoppingList.jsx` |
| `store_online_shop_opened` | User opens grocery store online shop | `src/pages/ShoppingList.jsx` |
| `price_comparison_opened` | User opens price comparison modal | `src/pages/ShoppingList.jsx` |
| `meal_swapped` | User swaps a meal for an AI alternative (server-side) | `backend/server.js` |
| `plan_retuned` | AI re-tunes remaining plan days based on logs (server-side) | `backend/server.js` |

## Next steps

We've built a dashboard and five insights to keep an eye on user behaviour:

- **Dashboard — Analytics basics:** https://eu.posthog.com/project/171317/dashboard/657330
- **Signup → Onboarding → Meal Plan funnel:** https://eu.posthog.com/project/171317/insights/J7EcHa3C
- **Daily active users by key action:** https://eu.posthog.com/project/171317/insights/kAsT1hzQ
- **Shopping engagement:** https://eu.posthog.com/project/171317/insights/r5XXuL1D
- **New users and churn signals:** https://eu.posthog.com/project/171317/insights/wGQER1Rl
- **Login failure rate:** https://eu.posthog.com/project/171317/insights/dNjb6fuj

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-javascript_node/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
