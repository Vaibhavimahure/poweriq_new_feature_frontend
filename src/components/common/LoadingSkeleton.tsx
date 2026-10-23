/**
 * LoadingSkeleton.tsx
 * ----------------------------------------------------------------------------
 * Clean, subtle loading placeholder for mobile cards and metric tiles.
 * ----------------------------------------------------------------------------
 */

import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, DimensionValue } from "react-native";
import { CONFIG } from "../../config/constants";

interface LoadingSkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: any;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  width = "100%",
  height = 20,
  borderRadius = 6,
  style,
}) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.8,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
};

export const CardSkeleton: React.FC<{ height?: number }> = ({ height = 180 }) => (
  <View style={[styles.cardContainer, { height }]}>
    <View style={styles.skeletonHeader}>
      <LoadingSkeleton width="40%" height={16} />
      <LoadingSkeleton width="20%" height={16} />
    </View>
    <View style={styles.skeletonBody}>
      <LoadingSkeleton width="70%" height={28} style={{ marginBottom: 12 }} />
      <View style={styles.gridRow}>
        <LoadingSkeleton width="48%" height={50} />
        <LoadingSkeleton width="48%" height={50} />
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: "#E2E8F0",
  },
  cardContainer: {
    backgroundColor: CONFIG.THEME.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    padding: 16,
    marginVertical: 6,
    ...CONFIG.THEME.shadowCard,
  },
  skeletonHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  skeletonBody: {
    flex: 1,
  },
  gridRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
