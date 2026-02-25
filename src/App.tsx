import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  MessageSquare, 
  Bell, 
  User as UserIcon, 
  Plus, 
  Clock, 
  Hash, 
  Send, 
  X, 
  CheckCircle2,
  ShieldCheck,
  Zap,
  ArrowLeft,
  Sparkles,
  Phone,
  PhoneOff,
  Volume2,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  BookOpen,
  LayoutGrid,
  Image as ImageIcon
} from 'lucide-react';
import { User, Request, Message, Blog, Post } from './types';
import { cn, generateId, AVATARS } from './lib/utils';
import { generateIcebreaker, summarizeConversation, moderateMessage } from './services/geminiService';
import { supabase } from './lib/supabase';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<any>(null);
  const [view, setView] = useState<'onboarding' | 'feed' | 'chat' | 'call' | 'summary' | 'blogs' | 'profile' | 'posts'>('onboarding');
  const [requests, setRequests] = useState<Request[]>([]);
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBlogModal, setShowBlogModal] = useState(false);
  const [icebreakers, setIcebreakers] = useState<string[]>([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [callPartner, setCallPartner] = useState<{ username: string, avatar: string, id: string } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (view === 'call') {
      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [view]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        syncUser(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        syncUser(session.user);
      } else {
        setUser(null);
        setView('onboarding');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const syncUser = async (supabaseUser: any) => {
    // Check if user exists in our users table
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', supabaseUser.id)
      .single();

    if (data) {
      setUser(data);
      setView('feed');
    } else {
      // Create user if not exists
      const newUser: User = {
        id: supabaseUser.id,
        username: supabaseUser.email?.split('@')[0] || 'user',
        avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
        trust_score: 100
      };
      await supabase.from('users').upsert(newUser);
      setUser(newUser);
      setView('feed');
    }
  };

  useEffect(() => {
    if (user) {
      fetchRequests();
      fetchBlogs();
      fetchPosts();

      // Subscribe to real-time messages
      const messageChannel = supabase
        .channel('messages')
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'messages' 
        }, (payload) => {
          const msg = payload.new as any;
          if (msg.conversation_id === activeConversationId) {
            setMessages(prev => [...prev, {
              conversationId: msg.conversation_id,
              senderId: msg.sender_id,
              content: msg.content,
              created_at: msg.created_at
            }]);
          }
        })
        .subscribe();

      // Subscribe to conversation matches
      const conversationChannel = supabase
        .channel('conversations')
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'conversations' 
        }, async (payload) => {
          const conv = payload.new as any;
          if (conv.user1_id === user.id || conv.user2_id === user.id) {
            const partnerId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id;
            const { data: partner } = await supabase.from('users').select('username, avatar').eq('id', partnerId).single();
            
            if (partner) {
              setCallPartner({ username: partner.username, avatar: partner.avatar, id: partnerId });
              setActiveConversationId(conv.id);
              setView('call');
              fetchMessages(conv.id);
            }
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(messageChannel);
        supabase.removeChannel(conversationChannel);
      };
    }
  }, [user, activeConversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from('requests')
      .select('*, users(username, avatar)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      const flattened = data.map(r => ({
        ...r,
        username: r.users?.username,
        avatar: r.users?.avatar
      }));
      setRequests(flattened);
    }
  };

  const fetchBlogs = async () => {
    const { data, error } = await supabase
      .from('blogs')
      .select('*, users(username, avatar)')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      const flattened = data.map(b => ({
        ...b,
        username: b.users?.username,
        avatar: b.users?.avatar
      }));
      setBlogs(flattened);
    }
  };

  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('*, users(username, avatar)')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      const flattened = data.map(p => ({
        ...p,
        username: p.users?.username,
        avatar: p.users?.avatar
      }));
      setPosts(flattened);
    }
  };

  const fetchMessages = async (convId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    
    if (!error && data) {
      setMessages(data.map(m => ({
        conversationId: m.conversation_id,
        senderId: m.sender_id,
        content: m.content,
        created_at: m.created_at
      })));
    }
  };

  const handleOnboarding = async (username: string) => {
    const newUser: User = {
      id: generateId(),
      username,
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
      trust_score: 100
    };
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser)
    });
    setUser(newUser);
    setView('feed');
  };

  const createRequest = async (type: 'wake' | 'topic', topic: string, time?: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('requests')
      .insert({
        id: generateId(),
        user_id: user.id,
        type,
        topic,
        scheduled_time: time,
        status: 'active'
      });
    
    if (!error) {
      setShowCreateModal(false);
      fetchRequests();
    }
  };

  const createBlog = async (title: string, content: string, imageUrl: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('blogs')
      .insert({
        title,
        content,
        author_id: user.id,
        image_url: imageUrl,
        tags: ['voice', 'social']
      });
    
    if (!error) {
      setShowBlogModal(false);
      fetchBlogs();
    }
  };

  const createPost = async (content: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('posts')
      .insert({ content, user_id: user.id });
    
    if (!error) fetchPosts();
  };

  const deletePost = async (postId: number) => {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);
    
    if (!error) fetchPosts();
  };

  const handleMatch = async (requestId: string) => {
    if (!user) return;
    
    const { data: request } = await supabase
      .from('requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (request && request.status === 'active') {
      const conversationId = `conv_${Date.now()}`;
      
      // Update request status
      await supabase
        .from('requests')
        .update({ status: 'matched' })
        .eq('id', requestId);
      
      // Create conversation
      await supabase
        .from('conversations')
        .insert({ 
          id: conversationId, 
          request_id: requestId, 
          user1_id: request.user_id, 
          user2_id: user.id 
        });
      
      // The real-time listener will pick this up and set the view
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConversationId || !user) return;
    
    setModerationError(null);
    const mod = await moderateMessage(newMessage);
    if (!mod.isSafe) {
      setModerationError(mod.reason || "Inappropriate content detected.");
      return;
    }

    await supabase
      .from('messages')
      .insert({
        conversation_id: activeConversationId,
        sender_id: user.id,
        content: newMessage
      });

    setNewMessage('');
  };

  const handleEndChat = async (rating?: number) => {
    if (rating && callPartner) {
      const { data: partner } = await supabase.from('users').select('trust_score').eq('id', callPartner.id).single();
      if (partner) {
        await supabase
          .from('users')
          .update({ trust_score: (partner.trust_score || 100) + rating })
          .eq('id', callPartner.id);
      }
    }

    setIsSummarizing(true);
    const chatSummary = await summarizeConversation(messages.map(m => ({
      sender: m.senderId === user?.id ? 'Me' : 'Them',
      text: m.content
    })));
    setSummary(chatSummary || "Conversation ended.");
    setIsSummarizing(false);
    setView('summary');
  };

  if (!user) {
    return <Auth onComplete={() => {}} />;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Mic className="text-black w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Zac</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold">{user.trust_score}</span>
          </div>
          <button onClick={() => setView('profile')}>
            <img src={user.avatar} alt="Profile" className="w-9 h-9 rounded-full border border-white/20 hover:border-emerald-500 transition-colors" referrerPolicy="no-referrer" />
          </button>
        </div>
      </header>

      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto">
        <AnimatePresence mode="wait">
          {view === 'feed' && (
            <motion.div
              key="feed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Active Requests</h2>
                <button 
                  onClick={() => setShowCreateModal(true)}
                  className="p-3 bg-emerald-500 rounded-2xl text-black hover:scale-105 transition-transform active:scale-95"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>

              <div className="grid gap-4">
                {requests.length === 0 ? (
                  <div className="py-20 text-center space-y-4">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                      <Zap className="w-8 h-8 text-white/20" />
                    </div>
                    <p className="text-white/40 font-medium">No active requests. Be the first!</p>
                  </div>
                ) : (
                  requests.map((req) => (
                    <RequestCard 
                      key={req.id} 
                      request={req} 
                      onMatch={() => handleMatch(req.id)}
                      isOwn={req.user_id === user.id}
                    />
                  ))
                )}
              </div>
            </motion.div>
          )}

          {view === 'blogs' && (
            <motion.div
              key="blogs"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Community Blogs</h2>
                <button 
                  onClick={() => setShowBlogModal(true)}
                  className="p-3 bg-emerald-500 rounded-2xl text-black hover:scale-105 transition-transform active:scale-95"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>

              <div className="grid gap-6">
                {blogs.length === 0 ? (
                  <div className="py-20 text-center space-y-4">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                      <BookOpen className="w-8 h-8 text-white/20" />
                    </div>
                    <p className="text-white/40 font-medium">No blogs yet. Share your story!</p>
                  </div>
                ) : (
                  blogs.map((blog) => (
                    <BlogCard key={blog.id} blog={blog} />
                  ))
                )}
              </div>
            </motion.div>
          )}

          {view === 'posts' && (
            <motion.div
              key="posts"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Community Posts</h2>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-[32px] p-6">
                <CreatePostForm onPost={createPost} />
              </div>

              <div className="grid gap-4">
                {posts.length === 0 ? (
                  <div className="py-20 text-center space-y-4">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                      <Sparkles className="w-8 h-8 text-white/20" />
                    </div>
                    <p className="text-white/40 font-medium">No posts yet. Be the first!</p>
                  </div>
                ) : (
                  posts.map((post) => (
                    <PostCard 
                      key={post.id} 
                      post={post} 
                      onDelete={() => deletePost(post.id)}
                      isOwn={post.user_id === user.id}
                    />
                  ))
                )}
              </div>
            </motion.div>
          )}

          {view === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col items-center text-center space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-2xl" />
                  <img src={user.avatar} className="w-32 h-32 rounded-full border-4 border-emerald-500 relative z-10" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <h2 className="text-3xl font-black italic">@{user.username}</h2>
                  <p className="text-white/40 font-bold uppercase tracking-widest text-xs mt-1">Voice Explorer</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4 w-full">
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-center">
                    <ShieldCheck className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                    <div className="text-2xl font-black">{user.trust_score}</div>
                    <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Trust Score</div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-center">
                    <Mic className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                    <div className="text-2xl font-black">{requests.filter(r => r.user_id === user.id).length}</div>
                    <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Requests</div>
                  </div>
                </div>

                <button 
                  onClick={() => supabase.auth.signOut()}
                  className="w-full py-4 bg-red-500/10 text-red-400 rounded-2xl font-bold border border-red-500/20 hover:bg-red-500/20 transition-colors"
                >
                  Sign Out
                </button>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Your Activity</h3>
                <div className="space-y-3">
                  {requests.filter(r => r.user_id === user.id).map(r => (
                    <div key={r.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", r.type === 'wake' ? "bg-blue-500/20 text-blue-400" : "bg-emerald-500/20 text-emerald-400")}>
                          {r.type === 'wake' ? <Bell className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </div>
                        <div className="text-sm font-medium truncate max-w-[150px]">{r.topic}</div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">{r.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'call' && (
            <motion.div
              key="call"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="fixed inset-0 z-50 bg-[#050505] flex flex-col items-center justify-center p-8"
            >
              <div className="absolute top-12 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-bold uppercase tracking-widest border border-emerald-500/20 mb-4">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  Live Voice Session
                </div>
                <h2 className="text-3xl font-black tracking-tight">{callPartner?.username || "Connecting..."}</h2>
                <p className="text-white/40 font-mono mt-2">
                  {Math.floor(callDuration / 60).toString().padStart(2, '0')}:{(callDuration % 60).toString().padStart(2, '0')}
                </p>
              </div>

              <div className="relative">
                <motion.div 
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 bg-emerald-500/20 rounded-full blur-3xl"
                />
                <img 
                  src={callPartner?.avatar} 
                  alt="Partner" 
                  className="w-48 h-48 rounded-full border-4 border-emerald-500 shadow-2xl relative z-10" 
                  referrerPolicy="no-referrer"
                />
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1">
                  {[1,2,3,4,5].map(i => (
                    <motion.div 
                      key={i}
                      animate={{ height: [10, 30, 10] }}
                      transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                      className="w-1 bg-emerald-500 rounded-full"
                    />
                  ))}
                </div>
              </div>

              <div className="absolute bottom-16 w-full max-w-md px-8 flex flex-col gap-8">
                <div className="flex items-center justify-center gap-6">
                  <button 
                    onClick={() => setIsMuted(!isMuted)}
                    className={cn(
                      "p-6 rounded-full transition-all",
                      isMuted ? "bg-red-500 text-white" : "bg-white/5 text-white hover:bg-white/10"
                    )}
                  >
                    {isMuted ? <Mic className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                  </button>
                  <button 
                    onClick={() => handleEndChat()}
                    className="p-8 bg-red-500 text-white rounded-full shadow-2xl shadow-red-500/40 hover:scale-110 transition-transform active:scale-95"
                  >
                    <PhoneOff className="w-10 h-10" />
                  </button>
                  <button 
                    onClick={() => setView('chat')}
                    className="p-6 bg-white/5 text-white rounded-full hover:bg-white/10 transition-all"
                  >
                    <MessageSquare className="w-8 h-8" />
                  </button>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-center">
                  <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2">Icebreaker</p>
                  <p className="text-sm font-medium italic">"If you could travel anywhere right now, where would it be?"</p>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="fixed inset-0 z-50 bg-[#050505] flex flex-col"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#050505]/80 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  <button onClick={() => setView('call')} className="p-2 hover:bg-white/5 rounded-full">
                    <ArrowLeft className="w-6 h-6" />
                  </button>
                  <div className="flex items-center gap-3">
                    <img src={callPartner?.avatar} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                    <div>
                      <h3 className="font-bold text-sm">{callPartner?.username}</h3>
                      <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Live Chat</p>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => handleEndChat()}
                  className="px-4 py-2 bg-red-500/10 text-red-400 rounded-xl text-xs font-bold border border-red-500/20"
                >
                  End Session
                </button>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((msg, i) => (
                  <div 
                    key={i}
                    className={cn(
                      "flex flex-col max-w-[80%]",
                      msg.senderId === user.id ? "ml-auto items-end" : "mr-auto items-start"
                    )}
                  >
                    <div className={cn(
                      "px-4 py-3 rounded-2xl text-sm",
                      msg.senderId === user.id 
                        ? "bg-emerald-500 text-black font-medium rounded-tr-none" 
                        : "bg-white/5 border border-white/10 text-white rounded-tl-none"
                    )}>
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-white/20 mt-1">
                      {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                ))}
                {moderationError && (
                  <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
                    <AlertTriangle className="w-4 h-4" />
                    {moderationError}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-white/5 bg-[#050505]">
                <div className="flex gap-3">
                  <input 
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                  <button 
                    onClick={sendMessage}
                    className="p-4 bg-emerald-500 rounded-2xl text-black hover:scale-105 transition-transform active:scale-95"
                  >
                    <Send className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'summary' && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="fixed inset-0 z-[60] bg-[#050505] flex flex-col items-center justify-center p-8 overflow-y-auto"
            >
              <div className="w-full max-w-md space-y-8 text-center">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-[32px] flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </div>
                <h2 className="text-3xl font-black">Session Ended</h2>
                
                <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 text-left space-y-6">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">AI Summary</h4>
                    <p className="text-lg leading-relaxed italic text-white/80">
                      {isSummarizing ? "Generating summary..." : `"${summary}"`}
                    </p>
                  </div>
                  
                  <div className="pt-6 border-t border-white/5">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4">Rate your partner</h4>
                    <div className="flex gap-4">
                      <button 
                        onClick={() => handleEndChat(1)}
                        className="flex-1 flex items-center justify-center gap-2 py-4 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                      >
                        <ThumbsUp className="w-5 h-5" />
                        Helpful
                      </button>
                      <button 
                        onClick={() => handleEndChat(-1)}
                        className="flex-1 flex items-center justify-center gap-2 py-4 bg-red-500/10 text-red-400 rounded-2xl border border-red-500/20 hover:bg-red-500/20 transition-colors"
                      >
                        <ThumbsDown className="w-5 h-5" />
                        Unpleasant
                      </button>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => { setSummary(null); setView('feed'); setMessages([]); setCallPartner(null); }}
                  className="w-full py-5 bg-white text-black rounded-2xl font-black text-xl hover:scale-[1.02] transition-transform"
                >
                  Back to Feed
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#050505]/80 backdrop-blur-xl border-t border-white/5 px-8 py-4 flex items-center justify-around">
        <button 
          onClick={() => setView('feed')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            view === 'feed' ? "text-emerald-500" : "text-white/40 hover:text-white/60"
          )}
        >
          <LayoutGrid className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Feed</span>
        </button>
        <button 
          onClick={() => setView('posts')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            view === 'posts' ? "text-emerald-500" : "text-white/40 hover:text-white/60"
          )}
        >
          <Sparkles className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Posts</span>
        </button>
        <button 
          onClick={() => setView('blogs')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            view === 'blogs' ? "text-emerald-500" : "text-white/40 hover:text-white/60"
          )}
        >
          <BookOpen className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Blogs</span>
        </button>
        <button 
          onClick={() => setView('profile')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            view === 'profile' ? "text-emerald-500" : "text-white/40 hover:text-white/60"
          )}
        >
          <UserIcon className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Profile</span>
        </button>
      </nav>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-[#111] border border-white/10 rounded-[32px] p-8 shadow-2xl"
            >
              <button 
                onClick={() => setShowCreateModal(false)}
                className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
              <h3 className="text-2xl font-bold mb-6">New Request</h3>
              <div className="space-y-6">
                <CreateRequestForm onPost={createRequest} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Blog Modal */}
      <AnimatePresence>
        {showBlogModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBlogModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-[#111] border border-white/10 rounded-[32px] p-8 shadow-2xl"
            >
              <button 
                onClick={() => setShowBlogModal(false)}
                className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
              <h3 className="text-2xl font-bold mb-6">Share a Story</h3>
              <div className="space-y-6">
                <CreateBlogForm onPost={createBlog} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CreateBlogForm({ onPost }: { onPost: (title: string, content: string, imageUrl: string) => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3 block">Title</label>
        <input 
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give your story a title..."
          className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 focus:outline-none focus:border-emerald-500/50 transition-colors"
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3 block">Cover Image URL</label>
        <div className="flex gap-3">
          <input 
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-4 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <button 
            onClick={() => setImageUrl(`https://picsum.photos/seed/${Math.random()}/800/400`)}
            className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3 block">Content</label>
        <textarea 
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your story here..."
          className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 h-48 focus:outline-none focus:border-emerald-500/50 transition-colors"
        />
      </div>
      <button 
        onClick={() => onPost(title, content, imageUrl)}
        className="w-full py-4 bg-emerald-500 text-black rounded-2xl font-bold text-lg hover:scale-[1.02] transition-transform active:scale-95 shadow-lg shadow-emerald-500/20"
      >
        Publish Story
      </button>
    </div>
  );
}

function BlogCard({ blog }: { blog: Blog }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#111] border border-white/5 rounded-[32px] overflow-hidden hover:border-white/10 transition-colors group"
    >
      {blog.image_url && (
        <div className="aspect-[2/1] overflow-hidden">
          <img 
            src={blog.image_url} 
            alt={blog.title} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      <div className="p-8 space-y-4">
        <div className="flex items-center gap-3">
          <img src={blog.avatar} className="w-6 h-6 rounded-full border border-white/10" referrerPolicy="no-referrer" />
          <span className="text-xs font-bold text-white/40">{blog.username}</span>
          <span className="text-white/10">•</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">
            {new Date(blog.created_at).toLocaleDateString()}
          </span>
        </div>
        <h3 className="text-2xl font-black tracking-tight leading-tight">{blog.title}</h3>
        <p className="text-white/60 line-clamp-3 leading-relaxed">
          {blog.content}
        </p>
        <div className="flex gap-2 pt-2">
          {blog.tags?.map((tag, i) => (
            <span key={i} className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold uppercase tracking-widest text-white/40">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function CreateRequestForm({ onPost }: { onPost: (type: 'wake' | 'topic', topic: string, time?: string) => void }) {
  const [type, setType] = useState<'wake' | 'topic'>('topic');
  const [topic, setTopic] = useState('');
  const [time, setTime] = useState('');

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3 block">Type</label>
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => setType('topic')}
            className={cn(
              "flex items-center justify-center gap-2 p-4 rounded-2xl font-bold transition-all",
              type === 'topic' ? "bg-emerald-500 text-black" : "bg-white/5 border border-white/10 text-white/60"
            )}
          >
            <Mic className="w-5 h-5" />
            Topic
          </button>
          <button 
            onClick={() => setType('wake')}
            className={cn(
              "flex items-center justify-center gap-2 p-4 rounded-2xl font-bold transition-all",
              type === 'wake' ? "bg-blue-500 text-white" : "bg-white/5 border border-white/10 text-white/60"
            )}
          >
            <Bell className="w-5 h-5" />
            Wake Up
          </button>
        </div>
      </div>

      {type === 'wake' && (
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3 block">Wake Up Time</label>
          <input 
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 focus:outline-none focus:border-blue-500/50 transition-colors text-white"
          />
        </div>
      )}

      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3 block">
          {type === 'topic' ? "What's on your mind?" : "Wake up message"}
        </label>
        <textarea 
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={type === 'topic' ? "E.g. I need advice on my startup idea..." : "E.g. Wake me up with a joke!"}
          className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 h-32 focus:outline-none focus:border-emerald-500/50 transition-colors"
        />
      </div>

      <button 
        onClick={() => onPost(type, topic, time)}
        className={cn(
          "w-full py-4 rounded-2xl font-bold text-lg hover:scale-[1.02] transition-transform active:scale-95 shadow-lg",
          type === 'topic' ? "bg-emerald-500 text-black shadow-emerald-500/20" : "bg-blue-500 text-white shadow-blue-500/20"
        )}
      >
        Post Request
      </button>
    </div>
  );
}

function CreatePostForm({ onPost }: { onPost: (content: string) => void }) {
  const [content, setContent] = useState('');

  const handleSubmit = () => {
    if (!content.trim()) return;
    onPost(content);
    setContent('');
  };

  return (
    <div className="space-y-4">
      <textarea 
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's happening?"
        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 h-24 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none"
      />
      <div className="flex justify-end">
        <button 
          onClick={handleSubmit}
          className="px-6 py-2 bg-emerald-500 text-black rounded-xl font-bold hover:scale-105 transition-transform active:scale-95"
        >
          Post
        </button>
      </div>
    </div>
  );
}

function PostCard({ post, onDelete, isOwn }: { post: Post, onDelete: () => void, isOwn: boolean }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#111] border border-white/5 rounded-[24px] p-6 hover:border-white/10 transition-colors group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <img src={post.avatar} className="w-8 h-8 rounded-full border border-white/10" referrerPolicy="no-referrer" />
          <div>
            <h4 className="font-bold text-sm">@{post.username}</h4>
            <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest">
              {new Date(post.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        {isOwn && (
          <button 
            onClick={onDelete}
            className="p-2 text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-white/80 leading-relaxed whitespace-pre-wrap">
        {post.content}
      </p>
    </motion.div>
  );
}

function Auth({ onComplete }: { onComplete: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Check your email for the confirmation link!');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8 text-center"
      >
        <div className="space-y-4">
          <div className="w-20 h-20 bg-emerald-500 rounded-[32px] flex items-center justify-center mx-auto shadow-2xl shadow-emerald-500/20">
            <Mic className="text-black w-10 h-10" />
          </div>
          <h1 className="text-5xl font-black tracking-tighter italic">ZAC</h1>
          <p className="text-white/40 font-medium uppercase tracking-[0.3em] text-xs">Social Voice Discovery</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4 text-left">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-[0.2em] text-white/30 ml-2">Email</label>
            <input 
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-colors"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-[0.2em] text-white/30 ml-2">Password</label>
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-500 transition-colors"
              required
            />
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-emerald-500 text-black rounded-2xl font-black text-xl hover:scale-[1.02] transition-transform active:scale-95 disabled:opacity-50 shadow-xl shadow-emerald-500/10"
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <button 
          onClick={() => setIsLogin(!isLogin)}
          className="text-white/40 hover:text-white transition-colors text-sm font-bold"
        >
          {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
        </button>
      </motion.div>
    </div>
  );
}

function Onboarding({ onComplete }: { onComplete: (username: string) => void }) {
  const [name, setName] = useState('');

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-12 text-center"
      >
        <div className="space-y-4">
          <div className="w-20 h-20 bg-emerald-500 rounded-[32px] flex items-center justify-center mx-auto shadow-2xl shadow-emerald-500/20">
            <Mic className="text-black w-10 h-10" />
          </div>
          <h1 className="text-5xl font-black tracking-tighter italic">ZAC</h1>
          <p className="text-white/40 font-medium uppercase tracking-[0.3em] text-xs">Social Voice Discovery</p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-[0.2em] text-white/30">Your Nickname</label>
            <input 
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-xl font-bold focus:outline-none focus:border-emerald-500 transition-colors text-center"
            />
          </div>
          <button 
            disabled={!name.trim()}
            onClick={() => onComplete(name)}
            className="w-full py-5 bg-emerald-500 text-black rounded-2xl font-black text-xl hover:scale-[1.02] transition-transform active:scale-95 disabled:opacity-50 disabled:scale-100 shadow-xl shadow-emerald-500/10"
          >
            Get Started
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function RequestCard({ request, onMatch, isOwn }: { request: Request, onMatch: () => void, isOwn: boolean }) {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-[#111] border border-white/5 rounded-[28px] p-6 hover:border-white/10 transition-colors group relative overflow-hidden"
    >
      {request.type === 'wake' && (
        <div className="absolute top-0 right-0 p-4">
          <div className="flex items-center gap-1 text-blue-400">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-bold">{request.scheduled_time}</span>
          </div>
        </div>
      )}
      
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <img src={request.avatar} alt={request.username} className="w-10 h-10 rounded-full border border-white/10" referrerPolicy="no-referrer" />
          <div>
            <h4 className="font-bold text-sm">{request.username}</h4>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-black text-white/30">
              <Clock className="w-3 h-3" />
              {new Date(request.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
        <div className={cn(
          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
          request.type === 'wake' ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"
        )}>
          {request.type}
        </div>
      </div>
      
      <p className="text-lg font-medium leading-relaxed mb-6 text-white/90">
        {request.topic}
      </p>

      {!isOwn && (
        <button 
          onClick={onMatch}
          className={cn(
            "w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all group-hover:scale-[1.01]",
            request.type === 'wake' ? "bg-blue-500 text-white hover:bg-blue-600" : "bg-white text-black hover:bg-emerald-500"
          )}
        >
          {request.type === 'wake' ? <Bell className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          {request.type === 'wake' ? "Wake Them Up" : "Connect Now"}
        </button>
      )}
      {isOwn && (
        <div className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl font-bold text-white/40 flex items-center justify-center gap-2">
          <Clock className="w-5 h-5" />
          Waiting for match...
        </div>
      )}
    </motion.div>
  );
}
