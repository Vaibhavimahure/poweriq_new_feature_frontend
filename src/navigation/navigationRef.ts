import { createNavigationContainerRef } from "@react-navigation/native";
import { RootStackParamList } from "../types/navigation";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let pendingNavigation: { name: keyof RootStackParamList; params: any } | null = null;

export function navigate<RouteName extends keyof RootStackParamList>(
  name: RouteName,
  params: RootStackParamList[RouteName]
) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name as any, params as any);
  } else {
    console.log("[NavigationRef] Navigation not ready yet, queuing:", name, params);
    pendingNavigation = { name, params };
  }
}

export function onNavigationReady() {
  if (pendingNavigation && navigationRef.isReady()) {
    console.log("[NavigationRef] Navigation ready, flushing queued navigation:", pendingNavigation.name);
    const { name, params } = pendingNavigation;
    pendingNavigation = null;
    navigationRef.navigate(name as any, params as any);
  }
}
