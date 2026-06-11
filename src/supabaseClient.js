import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://fybwjibrvwqwnspgswtp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_OjwJ22ODAsYQjH-IJ-rXGg_OWRXor1m'

let supabaseClient = null
try {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY)
} catch (e) {
  console.warn('Supabase client init failed:', e)
}

export default supabaseClient
