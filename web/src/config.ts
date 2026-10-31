/** Projeto Supabase. A chave "anon" é pública por projeto; quem protege os dados são as regras de linha (supabase/schema.sql). */
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
export const syncConfigured = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';
