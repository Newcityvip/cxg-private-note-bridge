import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || "MCW@234";

app.get("/health", (req, res) => {
  res.send("OK");
});

app.post("/sendPrivateNote", async (req, res) => {
  try {
    const key = req.headers["x-api-key"];
    if (key !== API_KEY) {
      return res.status(401).json({ ok:false, error:"Invalid API key" });
    }

    const { base, workspace_id, session_id, ticket_id, content } = req.body;

    const url = `${base}/socket.io/?EIO=4&transport=websocket`;

    // ⚠️ CXG uses socket messages, not REST
    // So here we simulate success for now
    // (later we can add real socket sender)

    console.log("PRIVATE NOTE:", content);

    res.json({ ok:true, message:"Bridge reached Railway successfully" });

  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

app.listen(PORT, () => {
  console.log("Bridge running on port", PORT);
});
