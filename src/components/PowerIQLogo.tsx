import React from "react";
import { View, Image, StyleSheet, DimensionValue } from "react-native";
import { POWERIQ_LOGO_URI } from "../assets/logoBase64";

interface PowerIQLogoProps {
  size?: number;
  width?: DimensionValue;
  height?: number;
}

export const PowerIQLogo: React.FC<PowerIQLogoProps> = ({ size = 68, width, height }) => {
  // Official image aspect ratio is 805 / 205 = ~3.927
  const computedHeight = height ?? size;
  const computedWidth = width ?? Math.round(computedHeight * 3.927);

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: POWERIQ_LOGO_URI }}
        style={{
          width: computedWidth,
          height: computedHeight,
        }}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
