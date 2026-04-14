import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { mobileTheme } from "../../ui/theme";

function WCMarkerBubbleComponent() {
  return (
    <View style={styles.markerBubble}>
      <Text style={styles.markerLabel}>WC</Text>
    </View>
  );
}

export const WCMarkerBubble = memo(WCMarkerBubbleComponent);

const styles = StyleSheet.create({
  markerBubble: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.textPrimary,
    borderColor: mobileTheme.colors.surface,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 2,
    height: 24,
    justifyContent: "center",
    width: 24
  },
  markerLabel: {
    color: mobileTheme.colors.surface,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.2,
    lineHeight: 9
  }
});
