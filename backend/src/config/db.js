import { env } from './env.js';
import { getSb } from '../db/supabase.js';

export async function connectDb() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  }

  const { error } = await getSb().from('tenants').select('id').limit(1);
  if (error) {
    throw new Error(
      `Supabase is not ready (${error.message}). SUPABASE_URL must be the project origin only, e.g. https://xxxx.supabase.co — not /rest/v1 and not the database connection string. Then run backend/supabase/schema.sql in the SQL Editor.`
    );
  }
  console.log('Supabase connected');
}
