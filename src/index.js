export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- Helpers ---
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj, null, 2), {
        status,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type, authorization, x-api-key",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        },
      });

    if (request.method === "OPTIONS") return json({ ok: true }, 200);

    const normBase = (base) => {
      if (!base) return "";
      // If base already ends with /api/v1 keep it, else append /api/v1
      if (/\/api\/v1\/?$/i.test(base)) return base.replace(/\/$/, "");
      if (/\/api\/v2\/?$/i.test(base)) return base.replace(/\/api\/v2\/?$/i, "/api/v1");
      if (/\/api\/?$/i.test(base)) return base.replace(/\/api\/?$/i, "/api/v1");
      return base.replace(/\/$/, "") + "/api/v1";
    };

    // --- Health ---
    if (path === "/health") {
      return json({
        ok: true,
        has_API_KEY: !!env.API_KEY,
        has_CXG_BASE: !!env.CXG_BASE,
        has_CXG_BEARER_TOKEN: !!env.CXG_BEARER_TOKEN,
        base_resolved: normBase(env.CXG_BASE),
      });
    }

    // --- Protect API with x-api-key ---
    const incomingKey = request.headers.get("x-api-key") || "";
    const expectedKey = (env.API_KEY || "").trim();
    if (!expectedKey) {
      return json({ ok: false, error: "Server misconfig: API_KEY missing in Worker settings" }, 500);
    }
    if (incomingKey !== expectedKey) {
      return json({ ok: false, error: "Unauthorized (bad x-api-key)" }, 401);
    }

    // --- Route ---
    if (path !== "/sendPrivateNote") {
      return json({ ok: false, error: "Not found" }, 404);
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    // --- Parse body ---
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const bot_id = String(body.bot_id || "").trim();
    const session_id = String(body.session_id || "").trim();
    const content = String(body.content || "").trim();

    if (!bot_id || !session_id || !content) {
      return json(
        {
          ok: false,
          error: "Missing required fields",
          required: ["bot_id", "session_id", "content"],
        },
        400
      );
    }

    // --- Auth to CXG: prefer incoming Authorization header, fallback to env token ---
    const incomingAuth = request.headers.get("authorization") || request.headers.get("Authorization") || "";
    const tokenFromEnv = (env.CXG_BEARER_TOKEN || "").trim();
    const authHeader =
      incomingAuth.startsWith("Bearer ")
        ? incomingAuth
        : tokenFromEnv
        ? `Bearer ${tokenFromEnv}`
        : "";

    if (!authHeader) {
      return json(
        { ok: false, error: "Missing Authorization. Provide Bearer token header or set CXG_BEARER_TOKEN secret." },
        401
      );
    }

    const base = normBase(env.CXG_BASE);
    if (!base) {
      return json({ ok: false, error: "Server misconfig: CXG_BASE missing in Worker settings" }, 500);
    }

    const endpoint = `${base}/messages/private-notes`;

    // --- Call CXG ---
    const payload = { bot_id, session_id, content };

    let resp, text;
    try {
      resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
          "authorization": authHeader,
        },
        body: JSON.stringify(payload),
      });
      text = await resp.text();
    } catch (err) {
      return json({ ok: false, error: "Fetch failed", detail: String(err), endpoint_used: endpoint }, 502);
    }

    let detail;
    try {
      detail = JSON.parse(text);
    } catch {
      detail = { raw: text };
    }

    return json(
      {
        ok: resp.ok,
        status: resp.status,
        endpoint_used: endpoint,
        sent: payload,
        detail,
      },
      resp.ok ? 200 : 502
    );
  },
};
