export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: corsHeaders_() });
    }

    // Health
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("OK", { status: 200, headers: corsHeaders_() });
    }

    // Main API
    if (request.method === "POST" && url.pathname === "/sendPrivateNote") {
      try {
        // simple API key protection
        const apiKey = request.headers.get("x-api-key") || "";
        if (env.API_KEY && apiKey !== env.API_KEY) {
          return jsonOut_({ ok: false, error: "Unauthorized (x-api-key)" }, 401);
        }

        const body = await request.json();

        // REQUIRED for CXG endpoint (your latest successful payload style)
        const bot_id = String(body.bot_id || "").trim();
        const session_id = String(body.session_id || "").trim();
        const content = String(body.content || "").trim();

        if (!bot_id) return jsonOut_({ ok: false, error: "bot_id required" }, 400);
        if (!session_id) return jsonOut_({ ok: false, error: "session_id required" }, 400);
        if (!content) return jsonOut_({ ok: false, error: "content required" }, 400);

        // IMPORTANT: match Railway base variable
        const base = (env.CXG_BASE || env.CXG_API_BASE || "").trim();
        if (!base) return jsonOut_({ ok: false, error: "Missing CXG_BASE" }, 500);

        const apiBase = normalizeBase_(base); // -> https://be-cs003.icxglobal.ai/api/v1

        const endpoint = `${apiBase}/messages/private-notes`;

        const token = (env.CXG_BEARER_TOKEN || "").trim();
        if (!token) return jsonOut_({ ok: false, error: "Missing CXG_BEARER_TOKEN" }, 500);

        const payload = { bot_id, session_id, content };

        const resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${token}`,
            "accept": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }

        if (!resp.ok) {
          return jsonOut_(
            { ok: false, error: "CXG API failed", status: resp.status, endpoint_used: endpoint, detail: data },
            502
          );
        }

        return jsonOut_({ ok: true, endpoint_used: endpoint, result: data }, 200);
      } catch (err) {
        return jsonOut_({ ok: false, error: String(err) }, 500);
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders_() });
  },
};

function normalizeBase_(base) {
  // Remove trailing slash
  const b = base.replace(/\/+$/, "");

  // If ends with /api/v1 already, keep
  if (/\/api\/v1$/i.test(b)) return b;

  // If ends with /api, append /v1
  if (/\/api$/i.test(b)) return `${b}/v1`;

  // otherwise assume domain root, append /api/v1
  return `${b}/api/v1`;
}

function corsHeaders_() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-api-key",
  };
}

function jsonOut_(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders_() },
  });
}
