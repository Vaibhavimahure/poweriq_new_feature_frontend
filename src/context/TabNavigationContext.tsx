import React, { createContext, useContext } from "react";
import { BottomTabType } from "../navigation/BottomTabNavigator";

interface TabNavigationContextType {
  isInTabNavigator: boolean;
  currentTab?: BottomTabType;
  setCurrentTab?: (tab: BottomTabType) => void;
}

export const TabNavigationContext = createContext<TabNavigationContextType>({
  isInTabNavigator: false,
});

export const useTabNavigation = () => useContext(TabNavigationContext);
