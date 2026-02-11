const express = require("express");
const cors = require("cors");
const { io } = require("socket.io-client");

const app = express();

app.use(cors());
app.use(express.json());

/*
POST BODY EXAMPLE:

{
  "token":"YOUR_BEARER_TOKEN",
  "workspace_id":"xxxx",
  "session_id":"xxxx",
  "customer_id":"xxxx",
  "ticket_id":"xxxx",
  "agent_id":"xxxx",
  "content":"Hello Private Note"
}
*/

app.post("/sendPrivateNote", async (req, res) => {
  try {
    const {
      token,
      workspace_id,
      session_id,
      customer_id,
      ticket_id,
      agent_id,
      content
    } = req.body;

    if (!token || !session_id || !content) {
      return res.json({ ok:false, error:"Missing required fields" });
    }

    console.log("Connecting socket...");

    const socket = io("https://be-cs003.icxglobal.ai", {
      path: "/socket.io/",
      transports: ["websocket"],
      extraHeaders: {
        Authorization: `Bearer ${token}`
      }
    });

    socket.on("connect", () => {

      console.log("Socket Connected");

      const payload = {
        sender_id: agent_id,
        receiver_id: customer_id,
        workspace_id,
        customer_id,
        session_id,
        ticket_id,
        content: `<p>${content}</p>`,
        type: "TEXT",
        is_private: true
      };

      console.log("Sending message.create", payload);

      socket.emit("message.create", payload);

      setTimeout(() => {
        socket.disconnect();
      }, 1500);

      res.json({ ok:true, message:"Private note sent (socket emit)" });

    });

    socket.on("connect_error", err => {
      console.log("Socket error", err.message);
      res.json({ ok:false, error:err.message });
    });

  } catch (e) {
    res.json({ ok:false, error:e.message });
  }
});

app.get("/", (req,res)=>{
  res.send("CXG PRIVATE NOTE BRIDGE RUNNING");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log("Server running on",PORT));
