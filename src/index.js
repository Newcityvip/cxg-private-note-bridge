export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---- CORS ----
    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: corsHeaders_() });
    }

    // ---- Health ----
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("OK", { status: 200, headers: corsHeaders_() });
    }

    // ---- Main endpoint ----
    // POST /sendPrivateNote
    if (request.method === "POST" && url.pathname === "/sendPrivateNote") {
      try {
        // Optional API key protection (recommended)
        const apiKey = request.headers.get("x-api-key") || "";
        if (env.API_KEY && apiKey !== env.API_KEY) {
          return jsonOut_({ ok: false, error: "Unauthorized (x-api-key)" }, 401);
        }

        const body = await request.json();

        // ✅ CXG expects ONLY these for private notes
        const bot_id = String(body.bot_id || "").trim();
        const session_id = String(body.session_id || "").trim();
        const content = String(body.content || "").trim();

        if (!bot_id || !session_id || !content) {
          return jsonOut_(
            { ok: false, error: "Missing required: bot_id, session_id, content" },
            400
          );
        }

        // Build API base safely
        const base = normalizeApiBase_(env.CXG_API_BASE || "https://api.mcw.cxgenie.app/api/v1");
        const endpoint = `${base}/messages/private-notes`;

        // Call CXG
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.CXG_BEARER_TOKEN || ""}`,
          },
          body: JSON.stringify({ bot_id, session_id, content }),
        });

        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }

        if (!resp.ok) {
          return jsonOut_(
            {
              ok: false,
              error: "CXG API failed",
              status: resp.status,
              detail: data,
              endpoint_used: endpoint
            },
            502
          );
        }

        return jsonOut_({ ok: true, result: data }, 200);

      } catch (err) {
        return jsonOut_({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders_() });
  }
};

function corsHeaders_() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonOut_(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders_() },
  });
}

function normalizeApiBase_(base) {
  let b = String(base || "").trim();
  if (!b) return "https://api.mcw.cxgenie.app/api/v1";

  // remove trailing slashes
  b = b.replace(/\/+$/, "");

  // if user provided only domain
  if (!/\/api\/v\d$/i.test(b) && !/\/api\/v\d\//i.test(b)) {
    // if ends with /api -> add /v1
    if (/\/api$/i.test(b)) return b + "/v1";
    // otherwise add /api/v1
    return b + "/api/v1";
  }

  // if ends with /api/v2 -> force to /api/v1 (your old 404 issue)
  if (/\/api\/v2$/i.test(b)) return b.replace(/\/api\/v2$/i, "/api/v1");

  // if ends with /api/v1 OK
  return b;
}
