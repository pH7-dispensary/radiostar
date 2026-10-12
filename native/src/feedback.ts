import * as Haptics from "expo-haptics";
export const feedback = {
  light: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  selection: () => void Haptics.selectionAsync(),
  success: () =>
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
};
