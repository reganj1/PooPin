import { useState } from "react";
import type { ReviewQuickTag } from "@poopin/domain";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { submitRestroomReview } from "../../lib/api";
import { mobileTheme } from "../../ui/theme";

const MAX_QUICK_TAGS = 2;

const QUICK_TAG_OPTIONS: Array<{ value: ReviewQuickTag; label: string; icon: string; positive: boolean }> = [
  { value: "clean", label: "Clean", icon: "✨", positive: true },
  { value: "smelly", label: "Smelly", icon: "🤢", positive: false },
  { value: "no_line", label: "No line", icon: "🚫", positive: true },
  { value: "crowded", label: "Crowded", icon: "🚻", positive: false },
  { value: "no_toilet_paper", label: "No toilet paper", icon: "🧻", positive: false },
  { value: "locked", label: "Locked", icon: "🔒", positive: false }
];

const RATING_LABELS = ["", "Poor", "Fair", "OK", "Good", "Excellent"];

// ─── Sub-components ──────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={starStyles.row}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} onPress={() => onChange(star)} hitSlop={10}>
          <Text style={[starStyles.star, star <= value ? starStyles.starFilled : starStyles.starEmpty]}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

const starStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8
  },
  star: {
    fontSize: 36
  },
  starFilled: {
    color: "#f59e0b"
  },
  starEmpty: {
    color: "#d1d5db"
  }
});

// ─── Main component ───────────────────────────────────────────────────────────

export interface ReviewFormModalProps {
  visible: boolean;
  bathroomId: string;
  restroomName: string;
  profileId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReviewFormModal({ visible, bathroomId, restroomName, profileId, onClose, onSuccess }: ReviewFormModalProps) {
  const [overallRating, setOverallRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<ReviewQuickTag[]>([]);
  const [reviewText, setReviewText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setOverallRating(0);
    setSelectedTags([]);
    setReviewText("");
    setIsSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const toggleTag = (tag: ReviewQuickTag) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= MAX_QUICK_TAGS) return prev;
      return [...prev, tag];
    });
  };

  const handleSubmit = async () => {
    if (overallRating === 0) {
      Alert.alert("Rating required", "Please select a star rating before submitting.");
      return;
    }

    setIsSubmitting(true);

    try {
      await submitRestroomReview({
        bathroomId,
        overallRating,
        quickTags: selectedTags,
        reviewText,
        profileId
      });

      Alert.alert("Review submitted!", "Thanks for helping the community.", [
        {
          text: "Done",
          onPress: () => {
            reset();
            onSuccess();
          }
        }
      ]);
    } catch (error) {
      Alert.alert("Could not submit review", error instanceof Error ? error.message : "Please try again.");
      setIsSubmitting(false);
    }
  };

  const canSubmit = overallRating > 0 && !isSubmitting;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header bar */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.headerCancel} hitSlop={8}>
            <Text style={styles.headerCancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Write a review</Text>
          <Pressable onPress={() => void handleSubmit()} disabled={!canSubmit} style={styles.headerSubmit} hitSlop={8}>
            <Text style={[styles.headerSubmitText, !canSubmit && styles.headerSubmitDisabled]}>
              {isSubmitting ? "Submitting…" : "Submit"}
            </Text>
          </Pressable>
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {/* Restroom context */}
          <Text style={styles.restroomName}>{restroomName}</Text>
          <Text style={styles.sectionEyebrow}>Overall experience *</Text>

          <StarRating value={overallRating} onChange={setOverallRating} />
          {overallRating > 0 ? <Text style={styles.ratingLabel}>{RATING_LABELS[overallRating]}</Text> : null}

          {/* Quick tags */}
          <Text style={[styles.sectionEyebrow, { marginTop: 24 }]}>Quick tags (pick up to {MAX_QUICK_TAGS})</Text>
          <View style={styles.tagGrid}>
            {QUICK_TAG_OPTIONS.map((opt) => {
              const selected = selectedTags.includes(opt.value);
              const disabled = !selected && selectedTags.length >= MAX_QUICK_TAGS;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => toggleTag(opt.value)}
                  disabled={disabled}
                  style={[styles.tagChip, selected && styles.tagChipSelected, disabled && styles.tagChipDisabled]}
                >
                  <Text style={styles.tagIcon}>{opt.icon}</Text>
                  <Text style={[styles.tagLabel, selected && styles.tagLabelSelected, disabled && styles.tagLabelDisabled]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Notes */}
          <Text style={[styles.sectionEyebrow, { marginTop: 24 }]}>Notes (optional)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Share what you noticed — cleanliness, smell, wait time…"
            placeholderTextColor={mobileTheme.colors.textFaint}
            value={reviewText}
            onChangeText={setReviewText}
            multiline
            maxLength={1500}
            textAlignVertical="top"
            returnKeyType="default"
          />
          <Text style={styles.charCount}>{reviewText.length} / 1500</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: mobileTheme.colors.pageBackground
  },
  header: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderBottomColor: mobileTheme.colors.borderSubtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  headerTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700"
  },
  headerCancel: {
    minWidth: 60
  },
  headerCancelText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15
  },
  headerSubmit: {
    minWidth: 60,
    alignItems: "flex-end"
  },
  headerSubmitText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 15,
    fontWeight: "700"
  },
  headerSubmitDisabled: {
    color: mobileTheme.colors.textFaint
  },
  form: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 10
  },
  restroomName: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8
  },
  sectionEyebrow: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginBottom: 10
  },
  ratingLabel: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4
  },
  tagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  tagChip: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  tagChipSelected: {
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.brand
  },
  tagChipDisabled: {
    opacity: 0.38
  },
  tagIcon: {
    fontSize: 16
  },
  tagLabel: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: "600"
  },
  tagLabelSelected: {
    color: mobileTheme.colors.brandStrong
  },
  tagLabelDisabled: {
    color: mobileTheme.colors.textFaint
  },
  textInput: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    color: mobileTheme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 100,
    padding: 14
  },
  charCount: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    textAlign: "right"
  }
});
