export interface User {
  id: string;
  username: string;
  avatar: string;
  trust_score: number;
}

export interface Request {
  id: string;
  user_id: string;
  username?: string;
  avatar?: string;
  type: 'wake' | 'topic';
  topic: string;
  scheduled_time?: string;
  status: 'active' | 'matched' | 'completed' | 'expired';
  created_at: string;
}

export interface Message {
  id?: number;
  conversationId: string;
  senderId: string;
  content: string;
  created_at?: string;
}

export interface Blog {
  id: number;
  title: string;
  content: string;
  author_id: string;
  image_url?: string;
  tags?: string[];
  created_at: string;
  username?: string;
  avatar?: string;
}

export interface Conversation {
  id: string;
  request_id: string;
  user1_id: string;
  user2_id: string;
  status: string;
}
