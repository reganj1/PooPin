import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { mobileTheme } from "../../src/ui/theme";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

const TAB_ACTIVE_TINT = mobileTheme.colors.brandStrong;
const TAB_INACTIVE_TINT = "#94a3b8";
const TAB_BAR_BG = mobileTheme.colors.surface;

function TabIcon({ name, focused, size = 24 }: { name: IoniconsName; focused: boolean; size?: number }) {
  return <Ionicons name={name} size={size} color={focused ? TAB_ACTIVE_TINT : TAB_INACTIVE_TINT} />;
}

function AddIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.addIconCircle, focused && styles.addIconCircleFocused]}>
      <Ionicons name="add" size={22} color="#ffffff" />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TAB_ACTIVE_TINT,
        tabBarInactiveTintColor: TAB_INACTIVE_TINT,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem
      }}
    >
      {/* 1 — Explore */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Explore",
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "map" : "map-outline"} focused={focused} />
        }}
      />

      {/* 2 — Your List */}
      <Tabs.Screen
        name="your-list"
        options={{
          title: "Your List",
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? "bookmark" : "bookmark-outline"} focused={focused} />
          )
        }}
      />

      {/* 3 — Add (centered, prominent) */}
      <Tabs.Screen
        name="add"
        options={{
          title: "Add",
          tabBarIcon: ({ focused }) => <AddIcon focused={focused} />,
          tabBarActiveTintColor: mobileTheme.colors.brand,
          tabBarInactiveTintColor: mobileTheme.colors.brand
        }}
      />

      {/* 4 — Leaderboard */}
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Leaderboard",
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "trophy" : "trophy-outline"} focused={focused} />
        }}
      />

      {/* 5 — Profile */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "person" : "person-outline"} focused={focused} />
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: TAB_BAR_BG,
    borderTopColor: mobileTheme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: Platform.OS === "ios" ? 82 : 62,
    paddingTop: 4,
    paddingBottom: 0
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2
  },
  tabItem: {
    paddingTop: 4
  },
  addIconCircle: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brand,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  addIconCircleFocused: {
    backgroundColor: mobileTheme.colors.brandStrong
  }
});
