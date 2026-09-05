import { createClient } from '@supabase/supabase-js';
import WebSocketImpl from 'ws';
import { env } from '../config/env.js';

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocketImpl;
}

let client;

export function getSb() {
  if (!client) {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
      throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env');
    }
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocketImpl },
    });
  }
  return client;
}
