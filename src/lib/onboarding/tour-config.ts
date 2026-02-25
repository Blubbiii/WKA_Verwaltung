/**
 * Onboarding Tour Configuration
 *
 * Constants, types, and defaults for the product tour system.
 * Tour state is stored in user.settings.onboarding (JSON field).
 */

export const TOUR_IDS = {
  MAIN: "main-tour",
} as const;

export type TourId = (typeof TOUR_IDS)[keyof typeof TOUR_IDS];

export interface OnboardingState {
  completedTours: string[];
  skippedAt?: string;
  lastTourVersion?: number;
}

export const CURRENT_TOUR_VERSION = 1;

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  completedTours: [],
  lastTourVersion: 0,
};
