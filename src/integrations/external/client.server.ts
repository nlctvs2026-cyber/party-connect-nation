// Server-only admin client for the party's own Supabase project.
// Uses the secret key stored as EXT_SUPABASE_SECRET_KEY — never import from client code.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const EXTERNAL_SUPABASE_URL = "https://iczivwdmqndqxtjifbjm.supabase.co";

function supabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    }
    if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

function create() {
  const key = process.env["EXT_SUPABASE_SECRET_KEY"];
  if (!key) throw new Error("Missing EXT_SUPABASE_SECRET_KEY");
  return createClient<Database>(EXTERNAL_SUPABASE_URL, key, {
    global: { fetch: supabaseFetch(key) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let _client: ReturnType<typeof create> | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof create>, {
  get(_target, prop, receiver) {
    if (!_client) _client = create();
    return Reflect.get(_client, prop, receiver);
  },
});
