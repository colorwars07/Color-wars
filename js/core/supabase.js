/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/core/supabase.js
 * Supabase client singleton
 * ═══════════════════════════════════════════════════════
 */

// ── CONFIG — Pon tus llaves reales aquí ──
const SUPABASE_URL      = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU_ANON_KEY_LARGUISIMA';

let _client = null;

/**
 * Inicializa el cliente (se llama una vez al arrancar)
 */
export function initSupabase() {
  if (_client) return _client;

  if (!window.supabase || !window.supabase.createClient) {
    throw new Error('Supabase CDN no cargado. Revisa tu conexión a internet.');
  }

  _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession:    true,
      autoRefreshToken:  true,
      detectSessionInUrl: true,
    },
  });

  console.log('[Supabase] Cliente inicializado con éxito');
  return _client;
}

/**
 * Obtiene el cliente inicializado
 */
export function getSupabase() {
  if (!_client) throw new Error('[Supabase] Cliente no inicializado. Llama a initSupabase() primero.');
  return _client;
}
