import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>Phase 1 Shell</Text>
        <Text style={styles.title}>Poopin iOS shell</Text>
        <Text style={styles.copy}>
          Expo Router is wired up and ready for the Phase 2 shared-domain work. The current web app remains unchanged.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#020617"
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24
  },
  eyebrow: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 12,
    textTransform: "uppercase"
  },
  title: {
    color: "#f8fafc",
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 12
  },
  copy: {
    color: "#cbd5e1",
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 420
  }
});
