export interface UserReference {
  userId: string;
  name: string;
  email: string;
  profileImage?: string | null;
  companyId?: string;
  role?: string;
  isTeam?: boolean;
  plantName?: string;
}

export interface Conversation {
  _id: string;
  type: "PRIVATE" | "GROUP";
  companyId: string;
  participants: UserReference[];
  groupId?: string | Group | null;
  lastMessage?: {
    content: string;
    senderId: string;
    senderName: string;
    messageType: string;
    createdAt: string;
  };
  unreadCount?: number;
  otherParticipant?: UserReference | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageAttachment {
  url: string;
  fileType: string;
  fileName: string;
  fileSize: number;
}

export interface MessageReplyInfo {
  _id: string;
  senderId: string;
  senderName: string;
  content: string;
  messageType: string;
}

export interface MessageItem {
  _id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole?: string;
  senderImage?: string | null;
  messageType: "text" | "image" | "document" | "video" | "voice";
  content: string;
  attachments?: MessageAttachment[];
  replyTo?: MessageReplyInfo | null;
  deliveredTo?: string[];
  readBy?: string[];
  isDeleted?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface GroupMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  profileImage?: string | null;
  isAdmin: boolean;
}

export interface Group {
  _id: string;
  name: string;
  description?: string;
  image?: string | null;
  companyId: string;
  adminIds: string[];
  memberIds: string[];
  memberCount?: number;
  isAdmin?: boolean;
  conversationId?: string | null;
  createdBy: string;
  members?: GroupMember[];
  createdAt: string;
  updatedAt?: string;
}
