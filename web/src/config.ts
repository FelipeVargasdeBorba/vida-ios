/** Projeto Supabase. A chave "anon" é pública por projeto; quem protege os dados são as regras de linha (supabase/schema.sql). */
export const SUPABASE_URL: string = 'https://owuhhjmnerwhlvcedcpt.supabase.co';
export const SUPABASE_ANON_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93dWhoam1uZXJ3aGx2Y2VkY3B0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NTYwNzEsImV4cCI6MjEwOTAzMjA3MX0.ixuR9HZ-cDgChc2aWSn_BugTcTlRLhRSJD1SyMtG0Ek';
export const syncConfigured = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';
