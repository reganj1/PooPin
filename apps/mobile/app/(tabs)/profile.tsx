import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getMyContributionCounts,
  getMyProfile,
  type MyProfile,
  updateMyActiveCard,
  updateMyDisplayName
} from "../../src/lib/api";
import {
  buildContributionScore,
  collectibleCards,
  type CollectibleCard,
  type CollectibleCardRarity,
  getCardByKey,
  getCurrentCard,
  getNextCard,
  getUnlockedCards,
  RARITY_COLORS
} from "../../src/lib/collectibles";
import { useSession } from "../../src/providers/session-provider";
import { mobileTheme } from "../../src/ui/theme";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

const { width: SCREEN_W } = Dimensions.get("window");
const GRID_PADDING = mobileTheme.spacing.screenX;
const GRID_GAP = 10;
const CARD_W = Math.floor((SCREEN_W - GRID_PADDING * 2 - GRID_GAP) / 2);

// ─── Rarity pill ─────────────────────────────────────────────────────────────

function RarityPill({ rarity, size = "sm" }: { rarity: CollectibleCardRarity; size?: "sm" | "md" }) {
  const c = RARITY_COLORS[rarity] ?? RARITY_COLORS.Common;
  return (
    <View style={[styles.rarityPill, { backgroundColor: c.bg, borderColor: c.border }]}>
      <View style={[styles.rarityPillDot, { backgroundColor: c.text }]} />
      <Text style={[styles.rarityPillText, { color: c.text, fontSize: size === "md" ? 12 : 10 }]}>
        {rarity}
      </Text>
    </View>
  );
}

// ─── Edit name modal ──────────────────────────────────────────────────────────

function EditNameModal({
  visible,
  initial,
  onClose,
  onSave
}: {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setValue(initial);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [visible, initial]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.modalHeaderBtn}>
            <Text style={styles.modalHeaderBtnCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.modalTitle}>Edit display name</Text>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={[styles.modalHeaderBtn, { opacity: saving ? 0.5 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={mobileTheme.colors.brandStrong} />
            ) : (
              <Text style={styles.modalHeaderBtnSave}>Save</Text>
            )}
          </Pressable>
        </View>
        <View style={styles.modalBody}>
          <Text style={styles.modalInputLabel}>Display name</Text>
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={setValue}
            style={styles.modalInput}
            placeholder="e.g. FlushHero42"
            placeholderTextColor={mobileTheme.colors.textFaint}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <Text style={styles.modalInputHint}>
            3–40 characters. Letters, numbers, spaces, apostrophes, or hyphens.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Active title showcase card ───────────────────────────────────────────────

function ActiveTitleCard({ card, score }: { card: CollectibleCard; score: number }) {
  const c = RARITY_COLORS[card.rarity] ?? RARITY_COLORS.Common;
  const nextCard = getNextCard(score);
  const divisor = nextCard && nextCard.threshold !== card.threshold
    ? nextCard.threshold - card.threshold
    : 1;
  const progressToNext = nextCard
    ? Math.min(100, Math.max(0, Math.round(((score - card.threshold) / divisor) * 100)))
    : 100;

  return (
    <View style={[styles.activeTitleCard, { backgroundColor: c.bg, borderColor: c.border }]}>
      {/* Header row */}
      <View style={styles.activeTitleHeader}>
        <RarityPill rarity={card.rarity} size="sm" />
        <View style={[styles.activeBadge, { backgroundColor: c.text }]}>
          <Text style={styles.activeBadgeText}>Active</Text>
        </View>
      </View>

      {/* Emoji + info */}
      <View style={styles.activeTitleBody}>
        <View style={[styles.activeTitleEmojiWrap, { backgroundColor: c.border }]}>
          <Text style={styles.activeTitleEmoji}>{card.mascot}</Text>
        </View>
        <View style={styles.activeTitleMeta}>
          <Text style={[styles.activeTitleName, { color: c.text }]}>{card.title}</Text>
          <Text style={styles.activeTitleFlavor} numberOfLines={3}>{card.flavorLine}</Text>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressBg}>
          <View
            style={[
              styles.progressFill,
              { width: `${progressToNext}%` as `${number}%`, backgroundColor: c.text }
            ]}
          />
        </View>
        {nextCard ? (
          <Text style={[styles.progressHint, { color: c.text }]}>
            {Math.max(0, nextCard.threshold - score)} pts to unlock{" "}
            <Text style={styles.progressHintBold}>{nextCard.title}</Text>
          </Text>
        ) : (
          <Text style={[styles.progressHint, { color: c.text }]}>Maximum tier reached 🎉</Text>
        )}
      </View>
    </View>
  );
}

// ─── Collection card (grid item) ──────────────────────────────────────────────

function CollectionCard({
  card,
  isActive,
  isUnlocked,
  onSelect,
  selecting
}: {
  card: CollectibleCard;
  isActive: boolean;
  isUnlocked: boolean;
  onSelect: () => void;
  selecting: boolean;
}) {
  const c = RARITY_COLORS[card.rarity] ?? RARITY_COLORS.Common;
  const locked = !isUnlocked;

  return (
    <Pressable
      onPress={() => !isActive && !locked && !selecting && onSelect()}
      disabled={isActive || locked || selecting}
      style={({ pressed }) => [
        styles.collCard,
        { width: CARD_W, borderColor: isActive ? c.text : locked ? mobileTheme.colors.border : c.border },
        isActive && { backgroundColor: c.bg },
        locked && styles.collCardLocked,
        pressed && !isActive && !locked && styles.collCardPressed
      ]}
    >
      {/* Rarity stripe */}
      <View style={[styles.collCardStripe, { backgroundColor: locked ? mobileTheme.colors.border : c.text }]} />

      {/* Emoji */}
      <Text style={[styles.collCardEmoji, locked && styles.collCardEmojiLocked]}>
        {locked ? "🔒" : card.mascot}
      </Text>

      {/* Title */}
      <Text
        style={[styles.collCardTitle, isActive && { color: c.text }, locked && styles.collCardTitleLocked]}
        numberOfLines={2}
      >
        {card.title}
      </Text>

      {/* Bottom row: rarity + status */}
      <View style={styles.collCardBottom}>
        {!locked ? (
          <RarityPill rarity={card.rarity} />
        ) : (
          <Text style={styles.collCardLockedLabel}>Locked</Text>
        )}
        {isActive ? (
          <Ionicons name="checkmark-circle" size={18} color={c.text} />
        ) : selecting ? (
          <ActivityIndicator size="small" color={mobileTheme.colors.textFaint} />
        ) : locked ? null : (
          <Ionicons name="ellipse-outline" size={18} color={mobileTheme.colors.textFaint} />
        )}
      </View>
    </Pressable>
  );
}

// ─── Settings row ─────────────────────────────────────────────────────────────

function SettingsRow({
  icon,
  label,
  onPress,
  destructive,
  detail,
  loading
}: {
  icon: IoniconsName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  detail?: string;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.settingsRow, pressed && styles.settingsRowPressed]}
    >
      <View style={[styles.settingsIconBox, destructive && styles.settingsIconBoxDestructive]}>
        <Ionicons
          name={icon}
          size={18}
          color={destructive ? mobileTheme.colors.errorText : mobileTheme.colors.brandStrong}
        />
      </View>
      <Text style={[styles.settingsRowLabel, destructive && styles.settingsRowLabelDestructive]}>
        {label}
      </Text>
      {detail ? <Text style={styles.settingsRowDetail}>{detail}</Text> : null}
      {loading ? (
        <ActivityIndicator size="small" color={mobileTheme.colors.textFaint} />
      ) : !destructive ? (
        <Ionicons name="chevron-forward" size={16} color={mobileTheme.colors.textFaint} />
      ) : null}
    </Pressable>
  );
}

// ─── Signed-out preview cards ─────────────────────────────────────────────────

function PreviewCard({ card }: { card: CollectibleCard }) {
  const c = RARITY_COLORS[card.rarity] ?? RARITY_COLORS.Common;
  return (
    <View style={[styles.previewCard, { borderColor: c.border, backgroundColor: c.bg }]}>
      <View style={[styles.previewCardStripe, { backgroundColor: c.text }]} />
      <Text style={styles.previewCardEmoji}>{card.mascot}</Text>
      <Text style={[styles.previewCardTitle, { color: c.text }]} numberOfLines={1}>{card.title}</Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isLoading: sessionLoading, signOut } = useSession();

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [score, setScore] = useState(0);
  const [unlockedCards, setUnlockedCards] = useState<CollectibleCard[]>([
    collectibleCards[0] as CollectibleCard
  ]);

  const [showEditName, setShowEditName] = useState(false);
  const [selectingCardKey, setSelectingCardKey] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    try {
      const p = await getMyProfile();
      if (!p) {
        setProfileLoading(false);
        return;
      }
      setProfile(p);
      const c = await getMyContributionCounts(p.id);
      const s = buildContributionScore(c);
      setScore(s);
      setUnlockedCards(getUnlockedCards(s));
    } catch {
      // show stale data silently
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void loadProfile();
  }, [user, loadProfile]);

  const handleSaveName = useCallback(
    async (newName: string) => {
      const result = await updateMyDisplayName(newName);
      if ("error" in result) {
        Alert.alert("Could not update name", result.error);
        return;
      }
      setProfile((prev) => (prev ? { ...prev, displayName: result.displayName } : prev));
      setShowEditName(false);
    },
    []
  );

  const handleSelectCard = useCallback(
    async (cardKey: string) => {
      if (selectingCardKey) return;
      setSelectingCardKey(cardKey);
      const result = await updateMyActiveCard(cardKey);
      if ("error" in result) {
        Alert.alert("Could not update title", result.error);
      } else {
        setProfile((prev) => (prev ? { ...prev, activeCardKey: cardKey } : prev));
      }
      setSelectingCardKey(null);
    },
    [selectingCardKey]
  );

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setIsSigningOut(true);
          try {
            await signOut();
          } finally {
            setIsSigningOut(false);
          }
        }
      }
    ]);
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.centered}>
          <ActivityIndicator color={mobileTheme.colors.brandStrong} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Signed-out ─────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <SafeAreaView style={styles.root}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Hero CTA */}
          <View style={styles.ctaCard}>
            <View style={styles.ctaAvatarRow}>
              <View style={styles.ctaAvatar}>
                <Ionicons name="person" size={36} color={mobileTheme.colors.textFaint} />
              </View>
            </View>
            <Text style={styles.ctaTitle}>Your Poopin Profile</Text>
            <Text style={styles.ctaBody}>
              Sign in to write reviews, earn collectible titles, and see your standing on the leaderboard.
            </Text>
            <View style={styles.ctaBenefits}>
              {(
                [
                  ["star-outline", "Write reviews & earn contribution points"],
                  ["camera-outline", "Upload photos of restrooms you visit"],
                  ["trophy-outline", "Climb the contributor leaderboard"],
                  ["layers-outline", "Unlock exclusive collectible titles"]
                ] as [IoniconsName, string][]
              ).map(([icon, label]) => (
                <View key={label} style={styles.ctaBenefitRow}>
                  <View style={styles.ctaBenefitIcon}>
                    <Ionicons name={icon} size={16} color={mobileTheme.colors.brandStrong} />
                  </View>
                  <Text style={styles.ctaBenefitText}>{label}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => router.push("/sign-in?returnTo=%2F(tabs)%2Fprofile" as Href)}
              style={({ pressed }) => [styles.ctaButton, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.ctaButtonText}>Sign in or create account</Text>
            </Pressable>
          </View>

          {/* Collectible preview strip */}
          <View style={styles.collectionPreviewSection}>
            <Text style={styles.collectionPreviewLabel}>Collectible titles to unlock</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.collectionPreviewScroll}
            >
              {(collectibleCards as readonly CollectibleCard[]).map((card) => (
                <PreviewCard key={card.key} card={card} />
              ))}
            </ScrollView>
          </View>

          {/* Support */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Support</Text>
            <View style={styles.settingsCard}>
              <SettingsRow
                icon="mail-outline"
                label="Contact us"
                onPress={() => router.push("/contact")}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Signed-in ──────────────────────────────────────────────────────────────

  const activeCardKey = profile?.activeCardKey ?? null;
  const currentTierCard = getCurrentCard(score);
  const activeCard = (activeCardKey ? getCardByKey(activeCardKey) : null) ?? currentTierCard;
  const displayInitials = profile
    ? (
        profile.displayName
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0])
          .join("")
          .toUpperCase() || "PP"
      )
    : (user.email?.[0]?.toUpperCase() ?? "?");

  const activeColors = activeCard ? RARITY_COLORS[activeCard.rarity] : RARITY_COLORS.Common;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Profile header card ── */}
        <View style={styles.profileCard}>
          {/* Avatar */}
          <View style={styles.profileAvatarWrap}>
            <View style={[styles.profileAvatar, { borderColor: activeColors.border }]}>
              <Text style={styles.profileAvatarText}>{displayInitials}</Text>
            </View>
            {activeCard && (
              <View style={[styles.profileAvatarBadge, { backgroundColor: activeColors.bg, borderColor: activeColors.border }]}>
                <Text style={styles.profileAvatarBadgeEmoji}>{activeCard.mascot}</Text>
              </View>
            )}
          </View>

          {/* Name + edit */}
          {profileLoading && !profile ? (
            <ActivityIndicator
              size="small"
              color={mobileTheme.colors.brandStrong}
              style={{ marginTop: 4 }}
            />
          ) : (
            <>
              <View style={styles.profileNameRow}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {profile?.displayName ?? "Loading…"}
                </Text>
                <Pressable
                  onPress={() => setShowEditName(true)}
                  style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={8}
                >
                  <Ionicons name="pencil" size={12} color={mobileTheme.colors.brandStrong} />
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>
              </View>
              <Text style={styles.profileEmail} numberOfLines={1}>{user.email}</Text>
              {activeCard && (
                <View style={styles.profileTitlePillWrap}>
                  <RarityPill rarity={activeCard.rarity} size="md" />
                  <Text style={[styles.profileTitleText, { color: activeColors.text }]}>
                    {activeCard.title}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Active title ── */}
        {activeCard && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Active title</Text>
            <ActiveTitleCard card={activeCard} score={score} />
          </View>
        )}

        {/* ── Collection ── */}
        <View style={styles.section}>
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>Your collection</Text>
            <Text style={styles.sectionLabelMeta}>
              {unlockedCards.length} / {collectibleCards.length} unlocked
            </Text>
          </View>

          {/* 2-column grid — all 6 cards */}
          <View style={styles.collectionGrid}>
            {(collectibleCards as readonly CollectibleCard[]).map((card) => {
              const isUnlocked = unlockedCards.some((u) => u.key === card.key);
              return (
                <CollectionCard
                  key={card.key}
                  card={card}
                  isActive={card.key === activeCard?.key}
                  isUnlocked={isUnlocked}
                  onSelect={() => void handleSelectCard(card.key)}
                  selecting={selectingCardKey === card.key}
                />
              );
            })}
          </View>

          <Text style={styles.collectionHint}>
            Tap any unlocked title to make it your active display title.
          </Text>
        </View>

        {/* ── Account ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.settingsCard}>
            <SettingsRow
              icon="mail-outline"
              label="Contact us"
              onPress={() => router.push("/contact")}
            />
            <View style={styles.settingsDivider} />
            <SettingsRow
              icon="log-out-outline"
              label="Sign out"
              onPress={handleSignOut}
              destructive
              loading={isSigningOut}
            />
          </View>
        </View>

      </ScrollView>

      <EditNameModal
        visible={showEditName}
        initial={profile?.displayName ?? ""}
        onClose={() => setShowEditName(false)}
        onSave={handleSaveName}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: {
    backgroundColor: mobileTheme.colors.pageBackground,
    flex: 1
  },
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center"
  },
  scrollContent: {
    gap: mobileTheme.spacing.sectionGap,
    paddingBottom: 56,
    paddingHorizontal: GRID_PADDING,
    paddingTop: mobileTheme.spacing.screenTop
  },

  // ── Section ──
  section: {
    gap: 10
  },
  sectionLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.0,
    paddingHorizontal: 2,
    textTransform: "uppercase"
  },
  sectionLabelRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2
  },
  sectionLabelMeta: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    fontWeight: "500"
  },

  // ── Profile header card ──
  profileCard: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    gap: 8,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    ...mobileTheme.shadows.hero
  },
  profileAvatarWrap: {
    marginBottom: 4,
    position: "relative"
  },
  profileAvatar: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: 40,
    borderWidth: 3,
    height: 80,
    justifyContent: "center",
    width: 80
  },
  profileAvatarText: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "700"
  },
  profileAvatarBadge: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 2,
    bottom: -4,
    height: 28,
    justifyContent: "center",
    position: "absolute",
    right: -4,
    width: 28
  },
  profileAvatarBadgeEmoji: {
    fontSize: 14
  },
  profileNameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  profileName: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    maxWidth: "80%"
  },
  editBtn: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.infoTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  editBtnText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "700"
  },
  profileEmail: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    marginTop: -2
  },
  profileTitlePillWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 2
  },
  profileTitleText: {
    fontSize: 13,
    fontWeight: "600"
  },

  // ── Rarity pill ──
  rarityPill: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3
  },
  rarityPillDot: {
    borderRadius: 99,
    height: 5,
    width: 5
  },
  rarityPillText: {
    fontWeight: "700",
    letterSpacing: 0.2
  },

  // ── Active title card ──
  activeTitleCard: {
    borderRadius: mobileTheme.radii.xl,
    borderWidth: 1.5,
    gap: 14,
    padding: 18,
    ...mobileTheme.shadows.card
  },
  activeTitleHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  activeBadge: {
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  activeBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  activeTitleBody: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14
  },
  activeTitleEmojiWrap: {
    alignItems: "center",
    borderRadius: mobileTheme.radii.md,
    height: 64,
    justifyContent: "center",
    width: 64
  },
  activeTitleEmoji: {
    fontSize: 34
  },
  activeTitleMeta: {
    flex: 1,
    gap: 5,
    justifyContent: "center"
  },
  activeTitleName: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3
  },
  activeTitleFlavor: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  progressSection: {
    gap: 6
  },
  progressBg: {
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 99,
    height: 5,
    overflow: "hidden"
  },
  progressFill: {
    borderRadius: 99,
    height: 5
  },
  progressHint: {
    fontSize: 12,
    fontWeight: "500"
  },
  progressHintBold: {
    fontWeight: "700"
  },

  // ── Collection grid ──
  collectionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP
  },
  collCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1.5,
    gap: 8,
    overflow: "hidden",
    padding: 14,
    ...mobileTheme.shadows.card
  },
  collCardLocked: {
    opacity: 0.45
  },
  collCardPressed: {
    opacity: 0.82
  },
  collCardStripe: {
    borderRadius: 2,
    height: 3,
    marginBottom: 2,
    width: "100%"
  },
  collCardEmoji: {
    fontSize: 34,
    textAlign: "center"
  },
  collCardEmojiLocked: {
    fontSize: 28
  },
  collCardTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17
  },
  collCardTitleLocked: {
    color: mobileTheme.colors.textFaint
  },
  collCardBottom: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2
  },
  collCardLockedLabel: {
    color: mobileTheme.colors.textFaint,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  collectionHint: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 2
  },

  // ── Settings card ──
  settingsCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    overflow: "hidden",
    ...mobileTheme.shadows.card
  },
  settingsDivider: {
    backgroundColor: mobileTheme.colors.border,
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16
  },
  settingsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15
  },
  settingsRowPressed: {
    backgroundColor: mobileTheme.colors.surfaceMuted
  },
  settingsIconBox: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.infoTint,
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  settingsIconBoxDestructive: {
    backgroundColor: mobileTheme.colors.errorTint
  },
  settingsRowLabel: {
    color: mobileTheme.colors.textPrimary,
    flex: 1,
    fontSize: 15,
    fontWeight: "500"
  },
  settingsRowLabelDestructive: {
    color: mobileTheme.colors.errorText
  },
  settingsRowDetail: {
    color: mobileTheme.colors.textFaint,
    fontSize: 14,
    marginRight: 4
  },

  // ── Signed-out CTA ──
  ctaCard: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    gap: 16,
    padding: 28,
    ...mobileTheme.shadows.hero
  },
  ctaAvatarRow: {
    marginBottom: 4
  },
  ctaAvatar: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    height: 72,
    justifyContent: "center",
    width: 72
  },
  ctaTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center"
  },
  ctaBody: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center"
  },
  ctaBenefits: {
    alignSelf: "stretch",
    gap: 10
  },
  ctaBenefitRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  ctaBenefitIcon: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.infoTint,
    borderRadius: 8,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  ctaBenefitText: {
    color: mobileTheme.colors.textSecondary,
    flex: 1,
    fontSize: 14
  },
  ctaButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: mobileTheme.colors.brandDeep,
    borderRadius: mobileTheme.radii.sm,
    paddingVertical: 15
  },
  ctaButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },

  // ── Collection preview (signed-out) ──
  collectionPreviewSection: {
    gap: 10
  },
  collectionPreviewLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.0,
    paddingHorizontal: 2,
    textTransform: "uppercase"
  },
  collectionPreviewScroll: {
    gap: 10,
    paddingHorizontal: 2
  },
  previewCard: {
    alignItems: "center",
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1.5,
    gap: 6,
    overflow: "hidden",
    padding: 14,
    width: 110,
    ...mobileTheme.shadows.card
  },
  previewCardStripe: {
    borderRadius: 2,
    height: 3,
    width: "100%",
    marginBottom: 2
  },
  previewCardEmoji: {
    fontSize: 32
  },
  previewCardTitle: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center"
  },

  // ── Edit name modal ──
  modalHeader: {
    alignItems: "center",
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16
  },
  modalHeaderBtn: {
    minWidth: 64
  },
  modalHeaderBtnCancel: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 16
  },
  modalHeaderBtnSave: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "right"
  },
  modalTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 17,
    fontWeight: "700"
  },
  modalBody: {
    gap: 10,
    padding: 24
  },
  modalInputLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  modalInput: {
    backgroundColor: mobileTheme.colors.pageBackground,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    color: mobileTheme.colors.textPrimary,
    fontSize: 17,
    padding: 14
  },
  modalInputHint: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    lineHeight: 17
  }
});
