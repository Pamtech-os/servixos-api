import type { PublicWebsiteData } from '../../website/services/website-generation.service';
import type {
  BusinessProfile,
  ChatTurn,
  ProfileSection,
  StartingPoint,
} from '../schemas/onboarding-session.schema';

export interface OnboardingSessionData {
  startingPoint: StartingPoint | null;
  profile: BusinessProfile;
  messages: ChatTurn[];
}

export type DiscoveryEvent =
  | { type: 'text'; delta: string }
  | { type: 'section'; section: ProfileSection; data: unknown }
  | { type: 'starting_point'; startingPoint: StartingPoint }
  | { type: 'website'; preview: WebsitePreviewData }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type DiscoveryEmitter = (event: DiscoveryEvent) => void;

export type SectionValue = NonNullable<BusinessProfile[ProfileSection]>;

export type SectionWriteResult =
  | { ok: true; value: SectionValue }
  | { ok: false; error: string };

/** Same shape the public site renders, so the frontend can reuse its renderer for the live preview. */
export type WebsitePreviewData = PublicWebsiteData & {
  generatedAt: Date | null;
};
