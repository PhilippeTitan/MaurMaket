/**
 * Future Support risk service — the read half of the meetup-safety advisory.
 *
 * The problem this exists to avoid: an advisory warning is only worth showing if
 * somebody reviewed the report behind it. There is no such service yet (the
 * Support website is deferred), so this gateway answers `connected: false` and
 * the app shows nothing — it never invents a risk, never shows an unreviewed
 * report, and never treats an empty answer as "this place is safe".
 *
 * Writing a report has a real path today and does not go through here: the
 * meetup screen routes the shopper to Help & Support, which is the live channel
 * (`support@maurmaket.com`). Do not add a submit function that pretends a case
 * was filed.
 */
import { advisoryFromNotice } from '../utils/meetupSafetyPolicy.js';

export type MeetupRiskNotice = {
  /** A reviewed risk for the meetup area, as the review recorded it. */
  status: 'under_review' | 'credible';
  /** How the review described the area, at the precision the review chose. */
  areaLabel?: string | null;
  condition?: 'temporary' | 'ongoing' | null;
  /** When the current review ends; the warning stops on its own after this. */
  reviewUntil?: string | null;
  /** A neutral, already-reviewed note. Never a reporter's identity or raw text. */
  note?: string | null;
};

export type MeetupSafetyAdvisory = {
  level: 'advisory';
  pauseRecommendations: boolean;
  condition: 'temporary' | 'ongoing' | null;
  areaLabel: string | null;
  reviewUntil: string | null;
  note: string | null;
};

export type MeetupSafetyRead =
  | { connected: true; advisory: MeetupSafetyAdvisory | null }
  | { connected: false; advisory: null };

export interface MeetupSafetyGateway {
  /**
   * The advisory for one pending checkout, if a reviewed risk is open.
   * Advisory only: callers must not change an order, a meetup, or a payment
   * because of it.
   */
  forPendingCheckout(pendingId: string): Promise<MeetupSafetyRead>;
}

export const meetupSafetyGateway: MeetupSafetyGateway = {
  async forPendingCheckout(_pendingId: string): Promise<MeetupSafetyRead> {
    return { connected: false, advisory: null };
  },
};

/** Apply the policy to whatever the service eventually returns. */
export function advisoryForNotice(notice: MeetupRiskNotice | null, now = Date.now()): MeetupSafetyAdvisory | null {
  return advisoryFromNotice(notice, now) as MeetupSafetyAdvisory | null;
}
