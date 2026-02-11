import express from "express";
import fetch from "node-fetch";
import { io } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const API_KEY = process.env.API_KEY || "MCW@234";
const CXG_BASE = (process.env.CXG_BASE || "https://be-cs003.icxglobal.ai").replace(/\/+$/, "");
const CXG_BEARER_TOKEN = process.env.CXG_BEARER_TOKEN || "";

app.get("/health", (req, res) => res.send("OK"));

function must(v, name) {
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function getMe_() {
  const r = await fetch(`${CXG_BASE}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${CXG_BEARER_TOKEN}` }
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`users/me failed: ${r.status} ${JSON.stringify(j)}`);
  return j?.data || j;
}

app.post("/sendPrivateNote", async (req, res) => {
  try {
    // simple protection
    const key = req.headers["x-api-key"];
    if (key !== API_KEY) return res.status(401).json({ ok: false, error: "Invalid API key" });

    must(CXG_BEARER_TOKEN, "CXG_BEARER_TOKEN env");

    const { workspace_id, customer_id, ticket_id, session_id, content } = req.body;

    must(workspace_id, "workspace_id");
    must(customer_id, "customer_id");
    must(ticket_id, "ticket_id");
    must(session_id, "session_id");
    must(content, "content");

    // get sender_id from token
    const me = await getMe_();
    const sender_id = me.id || me._id;
    if (!sender_id) throw new Error("Could not read sender_id from /users/me");

    // socket connect
    const socket = io(CXG_BASE, {
      path: "/socket.io",
      transports: ["websocket"],
      extraHeaders: {
        Authorization: `Bearer ${CXG_BEARER_TOKEN}`
      }
    });

    const timeoutMs = 15000;

    const result = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Socket timeout")), timeoutMs);

      socket.on("connect_error", (err) => {
        clearTimeout(t);
        try { socket.close(); } catch {}
        reject(new Error("connect_error: " + (err?.message || err)));
      });

      socket.on("connect", () => {
        // 1) join customer room
        socket.emit("room.conversation.join", customer_id);

        // 2) send private note
        const payload = {
          sender_id,
          receiver_id: customer_id,
          workspace_id,
          customer_id,
          ticket_id,
          session_id,
          is_private: true,
          is_typing: false,
          receiver_read_at: null,
          efficiency: 0,
          type: "TEXT",
          media: [],
          local_id: uuidv4(),
          created_at: new Date().toISOString(),
          // CXG UI sends HTML <p>...</p> so keep same style:
          content: `<p>${String(content).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
        };

        // use ACK if server supports it
        socket.emit("message.create", payload, (ack) => {
          clearTimeout(t);
          try { socket.close(); } catch {}
          resolve({ ok: true, ack: ack ?? null, sent: payload });
        });

        // if ACK never returns, still resolve after short delay
        setTimeout(() => {
          clearTimeout(t);
          try { socket.close(); } catch {}
          resolve({ ok: true, ack: null, sent: payload });
        }, 1200);
      });
    });

    return res.json(result);

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => console.log("Bridge running on", PORT));
