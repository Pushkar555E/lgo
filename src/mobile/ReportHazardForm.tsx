import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import NetInfo from "@react-native-community/netinfo";
import { v4 as uuidv4 } from "uuid";

import { insertReport } from "../db/hazardReportDb";
import { drainSyncQueue } from "../services/syncService";
import { useLocationCapture } from "../hooks/useLocationCapture";
import type { HazardReport, HazardSeverity } from "../types/hazardReport";

const SEVERITY_OPTIONS: HazardSeverity[] = ["LOW", "MODERATE", "SEVERE"];

export default function ReportHazardForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<HazardSeverity>("MODERATE");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { captureLocation, isCapturing: isCapturingLocation } = useLocationCapture();

  async function handleTakePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera permission needed", "Enable camera access in Settings to attach a photo.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6, // downscale in-camera — keeps queued uploads small on weak signal
      allowsEditing: false,
    });

    if (!result.canceled && result.assets?.[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function handleCaptureLocation() {
    try {
      const captured = await captureLocation();
      setLocation(captured);
    } catch {
      // useLocationCapture already surfaces the error string; the Alert
      // here just makes sure the field worker notices it immediately.
      Alert.alert("Couldn't get GPS location", "Check that location services are enabled and try again.");
    }
  }

  async function handleSubmit() {
    if (!photoUri) {
      Alert.alert("Photo required", "Attach a photo of the hazard before submitting.");
      return;
    }
    if (!location) {
      Alert.alert("Location required", "Capture GPS location before submitting.");
      return;
    }
    if (description.trim().length === 0) {
      Alert.alert("Description required", "Add a short description of what you're seeing.");
      return;
    }

    setIsSubmitting(true);
    try {
      const report: HazardReport = {
        id: uuidv4(),
        description: description.trim(),
        severity,
        latitude: location.latitude,
        longitude: location.longitude,
        gpsAccuracyMeters: location.accuracyMeters,
        photoUri,
        capturedAt: new Date().toISOString(),
        syncStatus: "PENDING",
        retryCount: 0,
        lastSyncError: null,
      };

      // Always write to SQLite first — this is the offline-first guarantee.
      // The report is safe on-device before we ever touch the network.
      await insertReport(report);

      // Reset the form immediately so the field worker can move on to the
      // next observation without waiting on network I/O.
      setDescription("");
      setSeverity("MODERATE");
      setPhotoUri(null);
      setLocation(null);
      onSubmitted?.();

      const netState = await NetInfo.fetch();
      if (netState.isConnected && netState.isInternetReachable) {
        // Fire-and-forget — drainSyncQueue manages its own status per report,
        // the form doesn't need to block or show upload progress here.
        drainSyncQueue().catch(() => {});
        Alert.alert("Report saved", "Syncing now — connection detected.");
      } else {
        Alert.alert("Report saved offline", "It will sync automatically once you're back online.");
      }
    } catch (err) {
      Alert.alert("Couldn't save report", "Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Report Hazard</Text>
      <Text style={styles.subtitle}>Works offline — saves to device and syncs automatically.</Text>

      <Text style={styles.label}>Photo</Text>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.photoPreview} />
      ) : (
        <View style={styles.photoPlaceholder}>
          <Text style={styles.photoPlaceholderText}>No photo attached</Text>
        </View>
      )}
      <Pressable style={styles.secondaryButton} onPress={handleTakePhoto}>
        <Text style={styles.secondaryButtonText}>{photoUri ? "Retake photo" : "Take photo"}</Text>
      </Pressable>

      <Text style={styles.label}>Location</Text>
      {location ? (
        <Text style={styles.locationText}>
          {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
          {location.accuracyMeters != null ? ` (±${Math.round(location.accuracyMeters)}m)` : ""}
        </Text>
      ) : (
        <Text style={styles.photoPlaceholderText}>No location captured</Text>
      )}
      <Pressable style={styles.secondaryButton} onPress={handleCaptureLocation} disabled={isCapturingLocation}>
        {isCapturingLocation ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.secondaryButtonText}>{location ? "Recapture GPS" : "Capture GPS"}</Text>
        )}
      </Pressable>

      <Text style={styles.label}>Severity</Text>
      <View style={styles.severityRow}>
        {SEVERITY_OPTIONS.map((level) => (
          <Pressable
            key={level}
            onPress={() => setSeverity(level)}
            style={[styles.severityChip, severity === level && styles.severityChipActive]}
          >
            <Text style={[styles.severityChipText, severity === level && styles.severityChipTextActive]}>
              {level}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.textInput}
        placeholder="What are you seeing? (cracks, mud flow, tilted trees...)"
        placeholderTextColor="#8A93A1"
        multiline
        numberOfLines={4}
        value={description}
        onChangeText={setDescription}
      />

      <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={isSubmitting}>
        {isSubmitting ? (
          <ActivityIndicator color="#0B0E11" />
        ) : (
          <Text style={styles.submitButtonText}>Submit report</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#0B0E11",
    flexGrow: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#E8EAED",
  },
  subtitle: {
    fontSize: 13,
    color: "#8A93A1",
    marginTop: 4,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#E8EAED",
    marginTop: 16,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  photoPreview: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    backgroundColor: "#151920",
  },
  photoPlaceholder: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    backgroundColor: "#151920",
    borderWidth: 1,
    borderColor: "#262B33",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  photoPlaceholderText: {
    color: "#8A93A1",
    fontSize: 13,
  },
  locationText: {
    color: "#E8EAED",
    fontFamily: "monospace",
    fontSize: 13,
  },
  secondaryButton: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#262B33",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#E8EAED",
    fontSize: 14,
    fontWeight: "500",
  },
  severityRow: {
    flexDirection: "row",
    gap: 8,
  },
  severityChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#262B33",
  },
  severityChipActive: {
    backgroundColor: "#D9A441",
    borderColor: "#D9A441",
  },
  severityChipText: {
    color: "#8A93A1",
    fontSize: 13,
    fontWeight: "600",
  },
  severityChipTextActive: {
    color: "#0B0E11",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#262B33",
    borderRadius: 8,
    padding: 12,
    color: "#E8EAED",
    fontSize: 14,
    textAlignVertical: "top",
    minHeight: 100,
  },
  submitButton: {
    marginTop: 28,
    backgroundColor: "#5B9279",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitButtonText: {
    color: "#0B0E11",
    fontSize: 15,
    fontWeight: "700",
  },
});
