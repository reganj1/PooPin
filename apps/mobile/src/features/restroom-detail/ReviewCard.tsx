import { useCallback, useEffect, useRef, useState } from "react";
import type { Review, ReviewComment, ReviewQuickTag } from "@poopin/domain";
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useRouter } from "expo-router";
import { mobileTheme } from "../../ui/theme";
import { addReviewComment, getReviewComments, likeRestroomReview, unlikeRestroomReview } from "../../lib/api";
import { getCardByTitle, getRarityColors } from "../../lib/cardCatalog";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const QUICK_TAG_INFO: Record<ReviewQuickTag, { label: string; icon: string; positive: boolean }> = {
  clean: { label: "Clean", icon: "✨", positive: true },
  smelly: { label: "Smelly", icon: "🤢", positive: false },
  no_line: { label: "No line", icon: "🚫", positive: true },
  crowded: { label: "Crowded", icon: "🚻", positive: false },
  no_toilet_paper: { label: "No toilet paper", icon: "🧻", positive: false },
  locked: { label: "Locked", icon: "🔒", positive: false }
};

const formatDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ReviewCardProps {
  review: Review;
  /** The signed-in user's profile ID, or null if signed out. */
  viewerProfileId: string | null;
  /** Called when an action requires sign-in. Caller shows the appropriate Alert. */
  onRequireSignIn: () => void;
  /** Name of the restroom, used in the share payload. */
  restroomName: string;
  /** City of the restroom, used in the share payload. */
  restroomCity: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ReviewCard({ review, viewerProfileId, onRequireSignIn, restroomName, restroomCity }: ReviewCardProps) {
  const router = useRouter();
  const tags = (review.quick_tags ?? []) as ReviewQuickTag[];

  const accountProfileId = review.profile_id;
  const hasProfile = Boolean(accountProfileId);
  const authorLabel =
    review.author_display_name?.trim() || (hasProfile ? "Contributor" : "Anonymous");
  const collectibleTitle = review.author_collectible_title?.trim() ?? null;
  const collectibleRarity = review.author_collectible_rarity?.trim() ?? null;
  const cardEntry = getCardByTitle(collectibleTitle);
  const rarityColors = getRarityColors(collectibleRarity ?? cardEntry?.rarity);

  // ── Like state (optimistic) ─────────────────────────────────────────────
  const [localLikeCount, setLocalLikeCount] = useState(review.like_count ?? 0);
  const [localViewerHasLiked, setLocalViewerHasLiked] = useState(review.viewer_has_liked ?? false);
  const [isLikePending, setIsLikePending] = useState(false);
  const [likeError, setLikeError] = useState<string | null>(null);

  // ── Comment state ───────────────────────────────────────────────────────
  const [isCommentExpanded, setIsCommentExpanded] = useState(false);
  const [loadedComments, setLoadedComments] = useState<ReviewComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const commentInputRef = useRef<TextInput>(null);

  const commentCount = review.comment_count ?? 0;

  // ── Sync from parent if review prop changes ─────────────────────────────
  useEffect(() => {
    setLocalLikeCount(review.like_count ?? 0);
    setLocalViewerHasLiked(review.viewer_has_liked ?? false);
  }, [review.like_count, review.viewer_has_liked]);

  // ── Like handler ────────────────────────────────────────────────────────
  const handleLike = useCallback(async () => {
    if (!viewerProfileId) {
      onRequireSignIn();
      return;
    }
    if (isLikePending) return;

    setLikeError(null);
    const wasLiked = localViewerHasLiked;
    const prevCount = localLikeCount;

    // Optimistic update
    setLocalViewerHasLiked(!wasLiked);
    setLocalLikeCount(wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1);
    setIsLikePending(true);

    try {
      if (wasLiked) {
        await unlikeRestroomReview(review.id, viewerProfileId);
      } else {
        await likeRestroomReview(review.id, viewerProfileId);
      }
    } catch {
      // Roll back on failure
      setLocalViewerHasLiked(wasLiked);
      setLocalLikeCount(prevCount);
      setLikeError("Could not update like right now.");
    } finally {
      setIsLikePending(false);
    }
  }, [viewerProfileId, isLikePending, localViewerHasLiked, localLikeCount, review.id, onRequireSignIn]);

  // ── Comment expand / collapse ───────────────────────────────────────────
  const handleToggleComments = useCallback(async () => {
    if (!isCommentExpanded && loadedComments.length === 0) {
      setIsLoadingComments(true);
      try {
        const comments = await getReviewComments(review.id);
        setLoadedComments(comments);
      } catch {
        // Non-fatal — expand anyway with no comments shown
      } finally {
        setIsLoadingComments(false);
      }
    }
    setIsCommentExpanded((prev) => !prev);
  }, [isCommentExpanded, loadedComments.length, review.id]);

  // ── Comment input focus guard ───────────────────────────────────────────
  const handleCommentInputFocus = useCallback(() => {
    if (!viewerProfileId) {
      commentInputRef.current?.blur();
      onRequireSignIn();
    }
  }, [viewerProfileId, onRequireSignIn]);

  // ── Comment submit ──────────────────────────────────────────────────────
  const handleCommentSubmit = useCallback(async () => {
    if (!viewerProfileId) {
      onRequireSignIn();
      return;
    }
    const body = commentBody.trim();
    if (body.length < 2 || isCommentSubmitting) return;

    setCommentError(null);
    setIsCommentSubmitting(true);

    try {
      const newComment = await addReviewComment(review.id, viewerProfileId, body);
      setLoadedComments((prev) => [...prev, newComment]);
      setCommentBody("");
    } catch {
      setCommentError("Could not post comment right now.");
    } finally {
      setIsCommentSubmitting(false);
    }
  }, [viewerProfileId, commentBody, isCommentSubmitting, review.id, onRequireSignIn]);

  // ── Share ───────────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    const text = review.review_text?.trim()
      ? `"${review.review_text.trim()}" — via Poopin\n${restroomName}, ${restroomCity}`
      : `Check out this restroom on Poopin: ${restroomName}, ${restroomCity}`;

    try {
      await Share.share({ message: text });
    } catch {
      // User cancelled or share unavailable — silent
    }
  }, [review.review_text, restroomName, restroomCity]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.card}>
      {/* Header row: identity (tappable when profile exists) · rating pill */}
      <View style={styles.headerRow}>
        <Pressable
          style={({ pressed }) => [styles.headerLeft, hasProfile && pressed && styles.identityPressed]}
          onPress={hasProfile ? () => router.push(`/u/${accountProfileId}`) : undefined}
          disabled={!hasProfile}
          accessibilityRole={hasProfile ? "button" : "text"}
          accessibilityLabel={hasProfile ? `View ${authorLabel}'s profile` : undefined}
        >
          <Text style={[styles.author, hasProfile && styles.authorTappable]} numberOfLines={1}>
            {authorLabel}
          </Text>
          {collectibleTitle ? (
            <View
              style={[
                styles.collectiblePill,
                { backgroundColor: rarityColors.bg, borderColor: rarityColors.border }
              ]}
            >
              {cardEntry ? (
                <Text style={styles.collectiblePillMascot}>{cardEntry.mascot}</Text>
              ) : null}
              <Text
                style={[styles.collectiblePillText, { color: rarityColors.text }]}
                numberOfLines={1}
              >
                {collectibleTitle}
              </Text>
            </View>
          ) : null}
          <Text style={styles.date}>Visited {formatDate(review.visit_time)}</Text>
        </Pressable>
        <View style={styles.ratingPill}>
          <Text style={styles.ratingPillText}>Overall {review.overall_rating.toFixed(1)}</Text>
        </View>
      </View>

      {/* Quick-tag chips */}
      {tags.length > 0 && (
        <View style={styles.tagRow}>
          {tags.map((tag) => {
            const info = QUICK_TAG_INFO[tag];
            if (!info) return null;
            return (
              <View
                key={tag}
                style={[styles.chip, info.positive ? styles.chipPositive : styles.chipNegative]}
              >
                <Text style={styles.chipIcon}>{info.icon}</Text>
                <Text style={[styles.chipText, info.positive ? styles.chipTextPositive : styles.chipTextNegative]}>
                  {info.label}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Review body */}
      {review.review_text ? (
        <Text style={styles.body}>"{review.review_text}"</Text>
      ) : (
        <Text style={styles.bodyEmpty}>No additional notes shared.</Text>
      )}

      {/* Action row: like · comments · share */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={handleLike}
          disabled={isLikePending}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={localViewerHasLiked ? "Unlike this review" : "Like this review"}
        >
          <Text style={[styles.actionIcon, localViewerHasLiked && styles.actionIconLiked]}>♥</Text>
          <Text style={[styles.actionLabel, localViewerHasLiked && styles.actionLabelLiked]}>
            {localLikeCount > 0 ? String(localLikeCount) : "Like"}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleToggleComments}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="View comments"
        >
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionLabel}>
            {commentCount > 0 ? String(commentCount) : "Comment"}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Share this review"
        >
          <Text style={styles.actionIcon}>↗</Text>
          <Text style={styles.actionLabel}>Share</Text>
        </Pressable>
      </View>

      {/* Inline error for like/comment */}
      {(likeError || commentError) && (
        <Text style={styles.inlineError}>{likeError ?? commentError}</Text>
      )}

      {/* Featured comment preview — shown collapsed when a comment exists but section is closed */}
      {!isCommentExpanded && commentCount > 0 && review.featured_comment && (
        <Pressable onPress={handleToggleComments} style={styles.featuredCommentWrap}>
          <Text style={styles.featuredCommentAuthor}>
            {review.featured_comment.author_display_name?.trim() || "Someone"}
          </Text>
          <Text style={styles.featuredCommentBody} numberOfLines={1}>
            {review.featured_comment.body}
          </Text>
          <Text style={styles.viewReplies}>View {commentCount > 1 ? `${commentCount} comments` : "comment"} →</Text>
        </Pressable>
      )}

      {/* Expanded comment section */}
      {isCommentExpanded && (
        <View style={styles.commentSection}>
          {isLoadingComments && (
            <ActivityIndicator size="small" color={mobileTheme.colors.brandStrong} style={styles.commentLoader} />
          )}

          {loadedComments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <Text style={styles.commentAuthor}>{c.author_display_name?.trim() || "Someone"}</Text>
              <Text style={styles.commentBody}>{c.body}</Text>
            </View>
          ))}

          {/* Add comment input */}
          <View style={styles.commentInputRow}>
            <TextInput
              ref={commentInputRef}
              style={styles.commentInput}
              placeholder="Add a comment…"
              placeholderTextColor={mobileTheme.colors.textFaint}
              value={commentBody}
              onChangeText={setCommentBody}
              onFocus={handleCommentInputFocus}
              maxLength={320}
              returnKeyType="send"
              onSubmitEditing={handleCommentSubmit}
              blurOnSubmit
            />
            <Pressable
              onPress={handleCommentSubmit}
              disabled={commentBody.trim().length < 2 || isCommentSubmitting}
              style={({ pressed }) => [
                styles.commentPostBtn,
                (commentBody.trim().length < 2 || isCommentSubmitting) && styles.commentPostBtnDisabled,
                pressed && styles.actionBtnPressed
              ]}
            >
              {isCommentSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.commentPostBtnText}>Post</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: mobileTheme.colors.pageBackground,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    gap: 10,
    padding: 16
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  headerLeft: {
    flex: 1,
    gap: 2
  },
  author: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700"
  },
  authorTappable: {
    color: mobileTheme.colors.brandStrong
  },
  identityPressed: {
    opacity: 0.6
  },
  collectiblePill: {
    alignSelf: "flex-start",
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  collectiblePillMascot: {
    fontSize: 10,
    lineHeight: 14
  },
  collectiblePillText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.1
  },
  date: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12
  },
  ratingPill: {
    backgroundColor: mobileTheme.colors.surfaceBrandTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  ratingPillText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 12,
    fontWeight: "700"
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  chip: {
    alignItems: "center",
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  chipPositive: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac"
  },
  chipNegative: {
    backgroundColor: "#fef9ec",
    borderColor: "#fcd34d"
  },
  chipIcon: {
    fontSize: 12
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600"
  },
  chipTextPositive: {
    color: "#15803d"
  },
  chipTextNegative: {
    color: "#92400e"
  },
  body: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    fontStyle: "italic",
    lineHeight: 21
  },
  bodyEmpty: {
    color: mobileTheme.colors.textFaint,
    fontSize: 13,
    fontStyle: "italic"
  },
  // Action row — three evenly spaced items, compact enough for small iPhones
  actionRow: {
    borderTopColor: mobileTheme.colors.borderSubtle,
    borderTopWidth: 1,
    flexDirection: "row",
    marginTop: 2,
    paddingTop: 10
  },
  actionBtn: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    paddingVertical: 2
  },
  actionBtnPressed: {
    opacity: 0.65
  },
  actionIcon: {
    color: mobileTheme.colors.textMuted,
    fontSize: 15
  },
  actionIconLiked: {
    color: "#e11d48"
  },
  actionLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: "600"
  },
  actionLabelLiked: {
    color: "#e11d48"
  },
  inlineError: {
    color: mobileTheme.colors.errorText,
    fontSize: 12
  },
  // Featured comment preview (collapsed state)
  featuredCommentWrap: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.borderSubtle,
    borderRadius: mobileTheme.radii.xs,
    borderWidth: 1,
    gap: 2,
    padding: 10
  },
  featuredCommentAuthor: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700"
  },
  featuredCommentBody: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18
  },
  viewReplies: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4
  },
  // Expanded comment section
  commentSection: {
    borderTopColor: mobileTheme.colors.borderSubtle,
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 10
  },
  commentLoader: {
    alignSelf: "flex-start"
  },
  commentRow: {
    gap: 2
  },
  commentAuthor: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700"
  },
  commentBody: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18
  },
  commentInputRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4
  },
  commentInput: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    color: mobileTheme.colors.textPrimary,
    flex: 1,
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  commentPostBtn: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brand,
    borderRadius: mobileTheme.radii.pill,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  commentPostBtnDisabled: {
    opacity: 0.45
  },
  commentPostBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700"
  }
});
