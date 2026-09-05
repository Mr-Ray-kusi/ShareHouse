import { env } from './env.js';
import { getSb } from '../db/supabase.js';

export async function connectDb() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  }

  const { error } = await getSb().from('tenants').select('id').limit(1);
  if (error) {
    throw new Error(
      `Supabase is not ready (${error.message}). Create a project, then run backend/supabase/schema.sql in the SQL Editor.`
    );
  }
  console.log('Supabase connected');
}
