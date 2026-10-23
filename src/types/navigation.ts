import { AlertItem } from "./alert";
import { UserReference } from "../modules/communication/types";

export type RootStackParamList = {
  Login: undefined;
  Dashboard: { tab?: "Home" | "Alerts" | "SEC" | "Discussions" | "Profile"; timestamp?: number } | undefined;
  AlertDetail: { alert?: AlertItem; alertId?: string };
  Settings: undefined;

  // New Communication Module Routes
  CommunicationHome: undefined;
  ChatScreen: { conversationId: string; recipient: UserReference };
  GroupChatScreen: { conversationId: string; groupId: string; groupName?: string };
  UserSearchScreen: { mode?: "chat" | "create_group" } | undefined;
  GroupInfoScreen: { groupId: string };

  // Feature Module Routes
  MachineAnalytics: { did?: string } | undefined;
  FavoriteMachine: undefined;
  PlantAvoidableLosses: { did?: string; panelName?: string } | undefined;
  DemandAnalysis: undefined;
  LfiAnalysis: undefined;
  ProductSec: undefined;
  ProductLogs: {
    productId: string;
    productName: string;
    unit?: string;
    secondaryUnit?: string;
  };
  AddProductionLog: {
    productId: string;
    productName: string;
    unit?: string;
    secondaryUnit?: string;
  };
  Profile: undefined;
  Alerts: undefined;

  // Legacy Discussion routes (preserved)
  Discussions: { initialTab?: "all" | "alert" | "plant" | "community" } | undefined;
  DiscussionChat: {
    discussionId: string;
    title?: string;
    alertId?: string | null;
    alert?: AlertItem;
  };
  StartDiscussion: { alertId?: string; alert?: AlertItem } | undefined;
  DiscussionParticipants: { discussionId: string };
  CommunityQuestionDetail: { questionId: string };
  AskCommunityQuestion: undefined;
};
