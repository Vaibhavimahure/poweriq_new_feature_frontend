// PowerIQ Communication Types

export type DiscussionType = "ALERT" | "PLANT";

export interface AlertContextSnapshot {
  panelName: string;
  tagName: string;
  severity: "critical" | "warning" | "info";
  value: number | null;
  unit: string;
  timestamp: string | Date;
  plantName?: string;
  deviceId?: string | null;
  message?: string;
}

export interface DiscussionParticipant {
  userId: string;
  name: string;
  role: string;
  email?: string;
  isTeam?: boolean;
  joinedAt?: string;
}

export interface MessageMention {
  userId?: string | null;
  name: string;
  isTeam?: boolean;
}

export interface CommunicationMessage {
  _id: string;
  discussionId: string;
  senderUserId: string;
  senderName: string;
  senderRole: string;
  senderImage?: string | null;
  message: string;
  mentions: MessageMention[];
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt?: string;
  editedAt?: string | null;
}

export interface DiscussionItem {
  _id: string;
  type: DiscussionType;
  alertId?: string | null;
  alertContext?: AlertContextSnapshot | null;
  companyId: string;
  plantId?: string | null;
  title: string;
  description: string;
  creatorUserId: string;
  creatorName: string;
  participants: DiscussionParticipant[];
  lastMessage?: {
    text: string;
    senderUserId: string;
    senderName: string;
    createdAt: string;
  };
  status: "active" | "resolved" | "archived" | "closed";
  isUnread?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityAttachment {
  id: string;
  name: string;
  type: "image" | "document";
  uri: string;
  mimeType?: string;
  size?: number;
}

export interface CommunityQuestion {
  _id: string;
  title: string;
  description: string;
  category: string;
  answersCount: number;
  helpfulVotes: number;
  hasVotedHelpful?: boolean;
  authorName: string; // "PowerIQ User"
  attachments?: CommunityAttachment[];
  canEdit?: boolean;
  isEdited?: boolean;
  editedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CommunityAnswer {
  _id: string;
  questionId: string;
  answerText: string;
  helpfulVotes: number;
  hasVotedHelpful?: boolean;
  authorName: string; // "PowerIQ User"
  attachments?: CommunityAttachment[];
  canEdit?: boolean;
  isEdited?: boolean;
  editedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CommunityQuestionDetail extends CommunityQuestion {
  answers: CommunityAnswer[];
}
