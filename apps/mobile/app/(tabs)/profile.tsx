import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
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
  formatPointEventLabel,
  getMyContributionCounts,
  getMyProfile,
  getMyRecentActivity,
  type MyProfile,
  type PointEventSummary,
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
import { getTitleCardImage } from "../../src/features/profile/cardAssets";
import { useSession } from "../../src/providers/session-provider";
import { mobileTheme } from "../../src/ui/theme";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

const { width: SCREEN_W } = Dimensions.get("window");
const SCREEN_PAD = mobileTheme.spacing.screenX;
const GRID_GAP = 10;
const CARD_W = Math.floor((SCREEN_W - SCREEN_PAD * 2 - GRID_GAP) / 2);

type Counts = { reviewCount: number; photoCount: number; restroomAddCount: number };

const formatRelativeDate = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

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

// ─── Contribution stat chip ───────────────────────────────────────────────────

function StatChip({
  value,
  label,
  weight,
  accentColor
}: {
  value: number;
  label: string;
  weight: string;
  accentColor: string;
}) {
  return (
    <View style={styles.statChip}>
      <Text style={[styles.statChipValue, { color: accentColor }]}>{value}</Text>
      <Text style={styles.statChipLabel}>{label}</Text>
      <Text style={[styles.statChipWeight, { color: accentColor }]}>{weight} ea.</Text>
    </View>
  );
}

// ─── Progress hero card ───────────────────────────────────────────────────────
// The central reward surface — shows score, tier, active card, progress, and
// contribution breakdown. Mirrors the web's ProfileCollectiblesPanel.

function ProgressHeroCard({
  activeCard,
  currentTierCard,
  score,
  counts
}: {
  activeCard: CollectibleCard;
  currentTierCard: CollectibleCard;
  score: number;
  counts: Counts;
}) {
  const c = RARITY_COLORS[activeCard.rarity] ?? RARITY_COLORS.Common;
  const activeCardImage = getTitleCardImage(activeCard.key);
  const nextCard = getNextCard(score);
  const remaining = nextCard ? Math.max(0, nextCard.threshold - score) : 0;

  // Progress always tracks from the current earned tier, not the active showcase card
  const base = currentTierCard.threshold;
  const peak = nextCard?.threshold ?? base;
  const range = Math.max(1, peak - base);
  const progressPct = nextCard
    ? Math.min(100, Math.max(0, Math.round(((score - base) / range) * 100)))
    : 100;

  const isDifferentCard = activeCard.key !== currentTierCard.key;

  return (
    <View style={styles.heroCard}>
      {/* ── Score + tier row ── */}
      <View style={styles.heroScoreRow}>
        <View style={styles.heroScoreLeft}>
          <Text style={styles.heroScoreEyebrow}>COLLECTION SCORE</Text>
          <View style={styles.heroScoreValueRow}>
            <Text style={styles.heroScoreNum}>{score}</Text>
            <Text style={styles.heroScoreUnit}> pts</Text>
          </View>
        </View>
        <View style={styles.heroScoreRight}>
          <RarityPill rarity={currentTierCard.rarity} />
          <Text style={styles.heroTierLabel}>Tier {currentTierCard.tier}</Text>
        </View>
      </View>

      {/* ── Separator ── */}
      <View style={styles.heroDivider} />

      {/* ── Active card showcase ── */}
      <View style={styles.heroShowcase}>
        {/* Rarity-tinted wrap; PNG art fills it, emoji as fallback */}
        <View style={[styles.heroEmojiWrap, { borderColor: c.border, backgroundColor: c.bg }]}>
          {activeCardImage ? (
            <Image
              source={activeCardImage}
              style={styles.heroCardImage}
              resizeMode="contain"
              accessibilityLabel={activeCard.title}
            />
          ) : (
            <Text style={styles.heroEmoji}>{activeCard.mascot}</Text>
          )}
        </View>
        <View style={styles.heroShowcaseText}>
          {/* Title uses rarity color — small, intentional collectible accent */}
          <Text style={[styles.heroCardTitle, { color: c.text }]} numberOfLines={1}>
            {activeCard.title}
          </Text>
          <Text style={styles.heroCardFlavor} numberOfLines={2}>
            {activeCard.flavorLine}
          </Text>
          {isDifferentCard && (
            <Text style={styles.heroCardNote}>
              Showcasing · earned {currentTierCard.rarity}
            </Text>
          )}
        </View>
      </View>

      {/* ── Progress bar ── */}
      <View style={styles.heroProgressSection}>
        <View style={styles.heroProgressLabelRow}>
          <Text style={styles.heroProgressLabel}>{score} pts</Text>
          {nextCard && (
            <Text style={styles.heroProgressLabel}>{nextCard.threshold} pts</Text>
          )}
        </View>
        {/* Track is neutral; fill uses rarity accent — progress indicator only */}
        <View style={styles.heroProgressTrack}>
          <View
            style={[
              styles.heroProgressFill,
              { width: `${progressPct}%` as `${number}%`, backgroundColor: c.text }
            ]}
          />
        </View>
        {nextCard ? (
          <Text style={styles.heroProgressHint}>
            {remaining} more pt{remaining !== 1 ? "s" : ""} to unlock{" "}
            <Text style={styles.heroProgressHintBold}>{nextCard.title}</Text>
            {" · "}
            <Text style={styles.heroProgressRarity}>{nextCard.rarity}</Text>
          </Text>
        ) : (
          <Text style={styles.heroProgressHint}>
            Every launch card unlocked. 🎉 More variants may land later.
          </Text>
        )}
      </View>

      {/* ── Contribution stats (collection weights) ── */}
      <Text style={styles.heroStatsTitle}>Collection contributions</Text>
      <View style={styles.heroStatsRow}>
        <StatChip
          value={counts.reviewCount}
          label="Reviews"
          weight="+1"
          accentColor={mobileTheme.colors.brandStrong}
        />
        <View style={styles.heroStatsDivider} />
        <StatChip
          value={counts.photoCount}
          label="Photos"
          weight="+1"
          accentColor={mobileTheme.colors.brandStrong}
        />
        <View style={styles.heroStatsDivider} />
        <StatChip
          value={counts.restroomAddCount}
          label="Restrooms"
          weight="+3"
          accentColor={mobileTheme.colors.brandStrong}
        />
      </View>

      {/* ── Clarifying note ── */}
      <Text style={styles.heroScoringNote}>
        Collection score unlocks title cards · separate from leaderboard points
      </Text>
    </View>
  );
}

// ─── Collection card ──────────────────────────────────────────────────────────

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
  const cardImage = getTitleCardImage(card.key);

  return (
    <Pressable
      onPress={() => !isActive && !locked && !selecting && onSelect()}
      disabled={isActive || locked || selecting}
      style={({ pressed }) => [
        styles.collCard,
        { width: CARD_W },
        // State communicated via border weight + color, not background fill
        isActive
          ? { backgroundColor: mobileTheme.colors.surface, borderColor: c.text, borderWidth: 2.5 }
          : locked
          ? { backgroundColor: mobileTheme.colors.surface, borderColor: mobileTheme.colors.border, borderWidth: 1 }
          : { backgroundColor: mobileTheme.colors.surface, borderColor: c.border, borderWidth: 1.5 },
        locked && styles.collCardLocked,
        pressed && !isActive && !locked && styles.collCardPressed
      ]}
    >
      {/* Art image — bleeds to card top/sides; card's overflow:hidden clips to rounded corners */}
      <View style={[styles.collCardImageWrap, { backgroundColor: c.bg }]}>
        {cardImage ? (
          <Image
            source={cardImage}
            style={styles.collCardImage}
            resizeMode="contain"
            accessibilityLabel={card.title}
          />
        ) : (
          <Text style={styles.collCardEmoji}>{card.mascot}</Text>
        )}
      </View>

      {/* State badge — absolutely positioned over the art */}
      {isActive ? (
        <View style={[styles.collActiveBadge, { backgroundColor: c.text }]}>
          <Ionicons name="checkmark" size={10} color="#ffffff" />
        </View>
      ) : locked ? (
        <View style={styles.collLockBadge}>
          <Ionicons name="lock-closed" size={9} color={mobileTheme.colors.textFaint} />
        </View>
      ) : null}

      {/* Title */}
      <Text
        style={[
          styles.collCardTitle,
          isActive && { color: c.text },
          locked && styles.collCardTitleLocked
        ]}
        numberOfLines={2}
      >
        {card.title}
      </Text>

      {/* Bottom row — icon + text cues for every state, not color alone */}
      <View style={styles.collCardBottom}>
        {locked ? (
          // Lock icon + threshold make state clear in grayscale
          <View style={styles.collCardLockedInfo}>
            <Ionicons name="lock-closed-outline" size={10} color={mobileTheme.colors.textFaint} />
            <Text style={styles.collCardThreshold}>{card.threshold} pts</Text>
          </View>
        ) : (
          <RarityPill rarity={card.rarity} />
        )}
        {!locked && (
          <View>
            {isActive ? (
              // "Equipped" is unambiguous even without color
              <Text style={[styles.collCardActionActive, { color: c.text }]}>Equipped</Text>
            ) : selecting ? (
              <ActivityIndicator size="small" color={mobileTheme.colors.textFaint} />
            ) : (
              <Text style={styles.collCardActionEquip}>Equip</Text>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── Activity event row ───────────────────────────────────────────────────────

function ActivityEventRow({ event }: { event: PointEventSummary }) {
  const iconName: IoniconsName =
    event.eventType === "review_created"
      ? "star-outline"
      : event.eventType === "photo_uploaded"
      ? "camera-outline"
      : "location-outline";

  return (
    <View style={styles.activityRow}>
      <View style={styles.activityIconBox}>
        <Ionicons name={iconName} size={16} color={mobileTheme.colors.brandStrong} />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityLabel}>{formatPointEventLabel(event.eventType)}</Text>
        <Text style={styles.activityDate}>{formatRelativeDate(event.createdAt)}</Text>
      </View>
      <View style={styles.activityPointsBadge}>
        <Text style={styles.activityPoints}>+{event.pointsDelta}</Text>
        <Text style={styles.activityPtsLabel}> pts</Text>
      </View>
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
            <Text style={styles.modalBtnCancel}>Cancel</Text>
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
              <Text style={styles.modalBtnSave}>Save</Text>
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

// ─── Settings row ─────────────────────────────────────────────────────────────

function SettingsRow({
  icon,
  label,
  onPress,
  destructive,
  loading
}: {
  icon: IoniconsName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
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
      {loading ? (
        <ActivityIndicator size="small" color={mobileTheme.colors.textFaint} />
      ) : !destructive ? (
        <Ionicons name="chevron-forward" size={16} color={mobileTheme.colors.textFaint} />
      ) : null}
    </Pressable>
  );
}

// ─── Signed-out preview card ──────────────────────────────────────────────────

function PreviewCard({ card }: { card: CollectibleCard }) {
  const c = RARITY_COLORS[card.rarity] ?? RARITY_COLORS.Common;
  const cardImage = getTitleCardImage(card.key);
  return (
    <View style={[styles.previewCard, { borderColor: c.border }]}>
      {/* Art image — bleeds to card top/sides; card's overflow:hidden clips corners */}
      <View style={[styles.previewCardImageWrap, { backgroundColor: c.bg }]}>
        {cardImage ? (
          <Image
            source={cardImage}
            style={styles.previewCardImage}
            resizeMode="contain"
            accessibilityLabel={card.title}
          />
        ) : (
          <Text style={styles.previewCardEmoji}>{card.mascot}</Text>
        )}
      </View>
      <Text style={[styles.previewCardTitle, { color: c.text }]} numberOfLines={1}>
        {card.title}
      </Text>
      <RarityPill rarity={card.rarity} />
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
  const [counts, setCounts] = useState<Counts>({ reviewCount: 0, photoCount: 0, restroomAddCount: 0 });
  const [unlockedCards, setUnlockedCards] = useState<CollectibleCard[]>([
    collectibleCards[0] as CollectibleCard
  ]);
  const [recentEvents, setRecentEvents] = useState<PointEventSummary[]>([]);

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
      const [c, events] = await Promise.all([
        getMyContributionCounts(p.id),
        getMyRecentActivity(p.id)
      ]);
      const s = buildContributionScore(c);
      setCounts(c);
      setScore(s);
      setUnlockedCards(getUnlockedCards(s));
      setRecentEvents(events);
    } catch {
      // show stale data silently
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void loadProfile();
  }, [user, loadProfile]);

  const handleSaveName = useCallback(async (newName: string) => {
    const result = await updateMyDisplayName(newName);
    if ("error" in result) {
      Alert.alert("Could not update name", result.error);
      return;
    }
    setProfile((prev) => (prev ? { ...prev, displayName: result.displayName } : prev));
    setShowEditName(false);
  }, []);

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
          <View style={styles.ctaCard}>
            <View style={styles.ctaAvatarWrap}>
              <View style={styles.ctaAvatar}>
                <Ionicons name="person" size={36} color={mobileTheme.colors.textFaint} />
              </View>
            </View>
            <Text style={styles.ctaTitle}>Your Poopin Profile</Text>
            <Text style={styles.ctaBody}>
              Sign in to write reviews, earn contribution points, and unlock collectible titles.
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

          <View style={styles.previewSection}>
            <Text style={styles.previewLabel}>Collectible titles to unlock</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.previewScroll}
            >
              {(collectibleCards as readonly CollectibleCard[]).map((card) => (
                <PreviewCard key={card.key} card={card} />
              ))}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Support</Text>
            <View style={styles.settingsCard}>
              <SettingsRow icon="mail-outline" label="Contact us" onPress={() => router.push("/contact")} />
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
  const activeColors = RARITY_COLORS[activeCard.rarity] ?? RARITY_COLORS.Common;

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

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Profile identity card ── */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatarWrap}>
            <View style={[styles.profileAvatar, { borderColor: activeColors.border }]}>
              <Text style={styles.profileAvatarText}>{displayInitials}</Text>
            </View>
            {/* Active card emoji badge */}
            <View
              style={[
                styles.profileAvatarBadge,
                { backgroundColor: activeColors.bg, borderColor: activeColors.border }
              ]}
            >
              <Text style={styles.profileAvatarBadgeEmoji}>{activeCard.mascot}</Text>
            </View>
          </View>

          {profileLoading && !profile ? (
            <ActivityIndicator
              size="small"
              color={mobileTheme.colors.brandStrong}
              style={{ marginTop: 6 }}
            />
          ) : (
            <>
              <View style={styles.profileNameRow}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {profile?.displayName ?? "Loading…"}
                </Text>
                <Pressable
                  onPress={() => setShowEditName(true)}
                  style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.65 }]}
                  hitSlop={10}
                >
                  <Ionicons name="pencil" size={12} color={mobileTheme.colors.brandStrong} />
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>
              </View>

              <Text style={styles.profileEmail} numberOfLines={1}>{user.email}</Text>

              {/* Score + active title summary row */}
              <View style={styles.profileSummaryRow}>
                <View style={[styles.profileScoreChip, { borderColor: activeColors.border, backgroundColor: activeColors.bg }]}>
                  <Text style={[styles.profileScoreChipText, { color: activeColors.text }]}>
                    {score} pts · Tier {currentTierCard.tier}
                  </Text>
                </View>
                <View style={styles.profileTitleChip}>
                  <Text style={styles.profileTitleChipEmoji}>{activeCard.mascot}</Text>
                  <Text
                    style={[styles.profileTitleChipText, { color: activeColors.text }]}
                    numberOfLines={1}
                  >
                    {activeCard.title}
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* ── Progress hero card (the main reward surface) ── */}
        <ProgressHeroCard
          activeCard={activeCard}
          currentTierCard={currentTierCard}
          score={score}
          counts={counts}
        />

        {/* ── Collection ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Your collection</Text>
            <Text style={styles.sectionMeta}>
              {unlockedCards.length} / {collectibleCards.length} unlocked
            </Text>
          </View>

          <View style={styles.collGrid}>
            {(collectibleCards as readonly CollectibleCard[]).map((card) => {
              const isUnlocked = unlockedCards.some((u) => u.key === card.key);
              return (
                <CollectionCard
                  key={card.key}
                  card={card}
                  isActive={card.key === activeCard.key}
                  isUnlocked={isUnlocked}
                  onSelect={() => void handleSelectCard(card.key)}
                  selecting={selectingCardKey === card.key}
                />
              );
            })}
          </View>

          <Text style={styles.collHint}>
            Tap any unlocked card to set it as your active title.
          </Text>
        </View>

        {/* ── Recent leaderboard activity ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Recent activity</Text>
            <View style={styles.activityHeaderBadge}>
              <View style={styles.activityHeaderBadgeDot} />
              <Text style={styles.activityHeaderBadgeText}>Leaderboard pts</Text>
            </View>
          </View>
          <View style={styles.activityCard}>
            <Text style={styles.activityExplainer}>
              Leaderboard points rank contributors publicly. Separate from your collection score.
            </Text>
            <View style={styles.activityDivider} />
            {profileLoading ? (
              <ActivityIndicator
                size="small"
                color={mobileTheme.colors.brandStrong}
                style={{ paddingVertical: 18 }}
              />
            ) : recentEvents.length === 0 ? (
              <View style={styles.activityEmpty}>
                <Ionicons name="pulse-outline" size={26} color={mobileTheme.colors.textFaint} />
                <Text style={styles.activityEmptyText}>
                  No leaderboard activity yet.{"\n"}Post a review, upload a photo, or add a restroom to start earning points.
                </Text>
              </View>
            ) : (
              recentEvents.map((event, i) => (
                <View key={event.id}>
                  {i > 0 && <View style={styles.activityRowDivider} />}
                  <ActivityEventRow event={event} />
                </View>
              ))
            )}
          </View>
        </View>

        {/* ── Account (secondary) ── */}
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
    paddingBottom: 60,
    paddingHorizontal: SCREEN_PAD,
    paddingTop: mobileTheme.spacing.screenTop
  },

  // ── Section ──
  section: {
    gap: 10
  },
  sectionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2
  },
  sectionLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.0,
    paddingHorizontal: 2,
    textTransform: "uppercase"
  },
  sectionMeta: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    fontWeight: "500"
  },

  // ── Profile identity card ──
  profileCard: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.xl,
    borderWidth: 1,
    gap: 8,
    paddingBottom: 22,
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
    borderRadius: 44,
    borderWidth: 3,
    height: 88,
    justifyContent: "center",
    width: 88
  },
  profileAvatarText: {
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.5
  },
  profileAvatarBadge: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 2,
    bottom: -2,
    height: 30,
    justifyContent: "center",
    position: "absolute",
    right: -4,
    width: 30
  },
  profileAvatarBadgeEmoji: {
    fontSize: 15
  },
  profileNameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  profileName: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.3,
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
  profileSummaryRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
    marginTop: 2
  },
  profileScoreChip: {
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  profileScoreChipText: {
    fontSize: 12,
    fontWeight: "700"
  },
  profileTitleChip: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  profileTitleChipEmoji: {
    fontSize: 14
  },
  profileTitleChipText: {
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

  // ── Stat chip ──
  statChip: {
    alignItems: "center",
    flex: 1,
    gap: 2
  },
  heroStatsTitle: {
    color: mobileTheme.colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  heroScoringNote: {
    color: mobileTheme.colors.textFaint,
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center"
  },

  // ── Recent activity ──
  activityHeaderBadge: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.infoTint,
    borderColor: mobileTheme.colors.infoBorder,
    borderRadius: mobileTheme.radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3
  },
  activityHeaderBadgeDot: {
    backgroundColor: mobileTheme.colors.brandStrong,
    borderRadius: 99,
    height: 5,
    width: 5
  },
  activityHeaderBadgeText: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2
  },
  activityCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1,
    overflow: "hidden",
    ...mobileTheme.shadows.card
  },
  activityExplainer: {
    color: mobileTheme.colors.textFaint,
    fontSize: 12,
    lineHeight: 17,
    padding: 14,
    paddingBottom: 8
  },
  activityDivider: {
    backgroundColor: mobileTheme.colors.border,
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14
  },
  activityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  activityRowDivider: {
    backgroundColor: mobileTheme.colors.border,
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14
  },
  activityIconBox: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.infoTint,
    borderRadius: 7,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  activityContent: {
    flex: 1,
    gap: 2
  },
  activityLabel: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600"
  },
  activityDate: {
    color: mobileTheme.colors.textFaint,
    fontSize: 11
  },
  activityPointsBadge: {
    alignItems: "baseline",
    flexDirection: "row"
  },
  activityPoints: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 15,
    fontWeight: "800"
  },
  activityPtsLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: "600"
  },
  activityEmpty: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 24
  },
  activityEmptyText: {
    color: mobileTheme.colors.textFaint,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center"
  },
  statChipValue: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5
  },
  statChipLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: "600"
  },
  statChipWeight: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2
  },

  // ── Progress hero card ──
  heroCard: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.xl,
    borderWidth: 1.5,
    gap: 14,
    padding: 20,
    ...mobileTheme.shadows.hero
  },
  heroScoreRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  heroScoreLeft: {
    gap: 2
  },
  heroScoreRight: {
    alignItems: "flex-end",
    gap: 5
  },
  heroScoreEyebrow: {
    color: mobileTheme.colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  heroScoreValueRow: {
    alignItems: "baseline",
    flexDirection: "row"
  },
  heroScoreNum: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -1.5
  },
  heroScoreUnit: {
    color: mobileTheme.colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
    marginBottom: 3
  },
  heroTierLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2
  },
  heroDivider: {
    backgroundColor: mobileTheme.colors.border,
    height: 1,
    marginVertical: -2
  },
  heroShowcase: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14
  },
  heroEmojiWrap: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderRadius: mobileTheme.radii.md,
    borderWidth: 1,
    height: 64,
    justifyContent: "center",
    width: 64
  },
  heroEmoji: {
    fontSize: 34
  },
  heroCardImage: {
    height: 56,
    width: 56
  },
  heroShowcaseText: {
    flex: 1,
    gap: 4,
    justifyContent: "center"
  },
  heroCardTitle: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.4
  },
  heroCardFlavor: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  heroCardNote: {
    color: mobileTheme.colors.textFaint,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2
  },
  heroProgressSection: {
    gap: 6
  },
  heroProgressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  heroProgressLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700"
  },
  heroProgressTrack: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderRadius: 99,
    height: 8,
    overflow: "hidden"
  },
  heroProgressFill: {
    borderRadius: 99,
    height: 8
  },
  heroProgressHint: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17
  },
  heroProgressHintBold: {
    color: mobileTheme.colors.textPrimary,
    fontWeight: "800"
  },
  heroProgressRarity: {
    fontWeight: "600",
    fontStyle: "italic"
  },
  heroStatsRow: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    paddingVertical: 10
  },
  heroStatsDivider: {
    backgroundColor: mobileTheme.colors.border,
    width: 1
  },

  // ── Collection grid ──
  collGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP
  },
  collCard: {
    borderRadius: mobileTheme.radii.lg,
    borderWidth: 1.5,
    gap: 6,
    overflow: "hidden",
    padding: 13,
    position: "relative",
    ...mobileTheme.shadows.card
  },
  collCardLocked: {
    opacity: 0.62
  },
  collCardPressed: {
    opacity: 0.78
  },
  collActiveBadge: {
    alignItems: "center",
    borderRadius: 10,
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: 10,
    top: 10,
    width: 20
  },
  collLockBadge: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: 10,
    top: 10,
    width: 20
  },
  collCardLockedInfo: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3
  },
  collCardEmoji: {
    fontSize: 36,
    textAlign: "center"
  },
  /**
   * Bleeds to the top and sides of the card (negates the card's padding).
   * The card's overflow:hidden + borderRadius clips the rounded top corners.
   */
  collCardImageWrap: {
    alignItems: "center",
    height: 96,
    justifyContent: "center",
    marginHorizontal: -13,
    marginTop: -13,
    overflow: "hidden"
  },
  collCardImage: {
    height: "100%",
    width: "100%"
  },
  collCardTitle: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17
  },
  collCardTitleLocked: {
    color: mobileTheme.colors.textSecondary
  },
  collCardBottom: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2
  },
  collCardThreshold: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.2
  },
  collCardActionActive: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2
  },
  collCardActionEquip: {
    color: mobileTheme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "700"
  },
  collHint: {
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
  ctaAvatarWrap: {
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
  previewSection: {
    gap: 10
  },
  previewLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.0,
    paddingHorizontal: 2,
    textTransform: "uppercase"
  },
  previewScroll: {
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
    width: 112,
    ...mobileTheme.shadows.card
  },
  previewCardEmoji: {
    fontSize: 30
  },
  previewCardImageWrap: {
    alignItems: "center",
    alignSelf: "stretch",
    height: 72,
    justifyContent: "center",
    marginHorizontal: -14,
    marginTop: -14,
    overflow: "hidden"
  },
  previewCardImage: {
    height: "100%",
    width: "100%"
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
  modalBtnCancel: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 16
  },
  modalBtnSave: {
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
