import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase Client (Server-side)
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // User Management
  app.post("/api/users", async (req, res) => {
    const { id, username, avatar } = req.body;
    const { error } = await supabase
      .from("users")
      .upsert({ id, username, avatar });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Request Management
  app.post("/api/requests", async (req, res) => {
    const { id, user_id, type, topic, scheduled_time } = req.body;
    const { error } = await supabase
      .from("requests")
      .insert({ id, user_id, type, topic, scheduled_time });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.get("/api/requests/active", async (req, res) => {
    const { data, error } = await supabase
      .from("requests")
      .select("*, users(username, avatar)")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message });
    
    // Flatten the join result to match previous API structure
    const flattened = data.map(r => ({
      ...r,
      username: r.users?.username,
      avatar: r.users?.avatar
    }));
    
    res.json(flattened);
  });

  // Blog Management
  app.get("/api/blogs", async (req, res) => {
    const { data, error } = await supabase
      .from("blogs")
      .select("*, users(username, avatar)")
      .order("created_at", { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message });

    const flattened = data.map(b => ({
      ...b,
      username: b.users?.username,
      avatar: b.users?.avatar
    }));

    res.json(flattened);
  });

  app.post("/api/blogs", async (req, res) => {
    const { title, content, author_id, image_url, tags } = req.body;
    const { data, error } = await supabase
      .from("blogs")
      .insert({ title, content, author_id, image_url, tags })
      .select()
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // Socket.io Logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join_conversation", (conversationId) => {
      socket.join(conversationId);
    });

    socket.on("send_message", async (data) => {
      const { conversationId, senderId, content } = data;
      const { error } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: senderId, content });
      
      if (!error) {
        io.to(conversationId).emit("new_message", data);
      }
    });

    socket.on("match_request", async (data) => {
      const { requestId, matcherId } = data;
      
      const { data: request, error: fetchError } = await supabase
        .from("requests")
        .select("*")
        .eq("id", requestId)
        .single();
      
      if (request && request.status === 'active') {
        const conversationId = `conv_${Date.now()}`;
        
        const { error: updateError } = await supabase
          .from("requests")
          .update({ status: 'matched' })
          .eq("id", requestId);
        
        if (!updateError) {
          await supabase
            .from("conversations")
            .insert({ id: conversationId, request_id: requestId, user1_id: request.user_id, user2_id: matcherId });

          const { data: user1 } = await supabase.from("users").select("username, avatar").eq("id", request.user_id).single();
          const { data: user2 } = await supabase.from("users").select("username, avatar").eq("id", matcherId).single();

          io.emit("request_matched", { 
            requestId, 
            conversationId, 
            user1: { id: request.user_id, ...user1 }, 
            user2: { id: matcherId, ...user2 } 
          });
        }
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  app.get("/api/messages/:conversationId", async (req, res) => {
    const { conversationId } = req.params;
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/users/rate", async (req, res) => {
    const { userId, rating } = req.body;
    
    // Get current score
    const { data: user } = await supabase.from("users").select("trust_score").eq("id", userId).single();
    if (user) {
      const { error } = await supabase
        .from("users")
        .update({ trust_score: (user.trust_score || 100) + rating })
        .eq("id", userId);
      
      if (error) return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
