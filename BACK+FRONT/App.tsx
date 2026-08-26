import { useEffect } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import ReportHazardForm from "./src/screens/ReportHazardForm";
import { startAutoSync } from "./src/services/syncService";

export default function App() {
  useEffect(() => {
    // Start listening for connectivity changes once, for the app's lifetime.
    // Any report saved via insertReport() while offline will be picked up
    // automatically the moment this fires on reconnect.
    const stopAutoSync = startAutoSync();
    return stopAutoSync;
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ReportHazardForm />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0B0E11",
  },
});
