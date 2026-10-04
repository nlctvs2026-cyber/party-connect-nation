// Browser client for the party's own Supabase project.
// Only the publishable key lives here — safe to ship to the browser.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const EXTERNAL_SUPABASE_URL = "https://iczivwdmqndqxtjifbjm.supabase.co";
const EXTERNAL_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ajE9wzC159Psx9AVP3nqzw_z2cd8BQ0";

function supabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    }
    // New-style publishable keys are opaque strings, not bearer JWTs.
    if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

function create() {
  return createClient<Database>(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: supabaseFetch(EXTERNAL_SUPABASE_PUBLISHABLE_KEY) },
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

let _client: ReturnType<typeof create> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof create>, {
  get(_target, prop, receiver) {
    if (!_client) _client = create();
    return Reflect.get(_client, prop, receiver);
  },
});
