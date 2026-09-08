import type { UserTier } from '@/lib/one/tier-resolution';
import type { OneUserSettings, OneUserProfile, VoiceMode, PersonalityFlavor, MorningNewsMode } from '@/lib/one/user-settings';

export type { UserTier, OneUserProfile, VoiceMode, PersonalityFlavor, MorningNewsMode };

/**
 * Canonical unified representation of an individual user/operator record in One.
 */
export type OneUserRecord = OneUserSettings;