// supabase.js — Supabase client configuration
// This file creates a single Supabase connection
// used throughout the entire app

import { createClient } from '@supabase/supabase-js'

// Prefer using environment variables so the project can be configured per dev
// (Vite exposes env vars prefixed with VITE_ to the client code).
const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL || 'https://hwjbnkkfrcsdzfuukhqh.supabase.co'
const supabaseKey  = import.meta.env.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3amJua2tmcmNzZHpmdXVraHFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NDU4NzMsImV4cCI6MjA5MzEyMTg3M30.XOtqBozBy7zu2QT2IF0Ed96Dh-Pt6-xiPUZsLl5owzM'

export const supabase = createClient(supabaseUrl, supabaseKey)