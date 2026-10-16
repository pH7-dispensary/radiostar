import { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useReducedMotion } from "./LoadingState";
export function PodcastArtwork({
  uri,
  label = "Podcast artwork",
  style,
}: {
  uri?: string;
  label?: string;
  style: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    setFailed(false);
    opacity.setValue(0);
    return () => opacity.stopAnimation();
  }, [uri, opacity]);
  return (
    <View
      accessibilityLabel={label}
      style={[
        {
          overflow: "hidden",
          backgroundColor: "#342D47",
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Ionicons name="headset-outline" color="#C9C0E0" size={22} />
      {uri && !failed && (
        <Animated.Image
          accessibilityIgnoresInvertColors
          source={{ uri }}
          onError={() => setFailed(true)}
          onLoad={() => {
            Animated.timing(opacity, {
              toValue: 1,
              duration: reduced ? 0 : 180,
              useNativeDriver: true,
            }).start();
          }}
          style={[StyleSheet.absoluteFill, { opacity }]}
        />
      )}
    </View>
  );
}
