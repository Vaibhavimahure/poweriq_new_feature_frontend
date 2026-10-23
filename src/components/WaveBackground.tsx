import React from "react";
import { StyleSheet, View, Dimensions } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";

export const WaveBackground: React.FC = () => {
  const { width, height } = Dimensions.get("window");

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
        <Defs>
          <LinearGradient id="waveGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#3B82F6" stopOpacity="0.08" />
            <Stop offset="50%" stopColor="#93C5FD" stopOpacity="0.04" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#3B82F6" stopOpacity="0" />
            <Stop offset="40%" stopColor="#60A5FA" stopOpacity="0.18" />
            <Stop offset="100%" stopColor="#3B82F6" stopOpacity="0.03" />
          </LinearGradient>
        </Defs>

        {/* Subtle curved contour lines resembling the reference */}
        <Path
          d={`M -50 ${height * 0.28} C ${width * 0.3} ${height * 0.35}, ${width * 0.7} ${height * 0.22}, ${width + 50} ${height * 0.33}`}
          stroke="url(#lineGrad)"
          strokeWidth="1.5"
          fill="none"
        />
        <Path
          d={`M -50 ${height * 0.31} C ${width * 0.35} ${height * 0.39}, ${width * 0.65} ${height * 0.25}, ${width + 50} ${height * 0.36}`}
          stroke="url(#lineGrad)"
          strokeWidth="1.2"
          fill="none"
        />
        <Path
          d={`M -50 ${height * 0.34} C ${width * 0.4} ${height * 0.43}, ${width * 0.6} ${height * 0.28}, ${width + 50} ${height * 0.40}`}
          stroke="url(#lineGrad)"
          strokeWidth="1"
          fill="none"
        />
      </Svg>
    </View>
  );
};
