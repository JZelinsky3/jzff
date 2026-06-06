// Shared constants between WelcomePopup and its loader. Lives in its own
// module so WelcomePopupLoader can read the dismissal version without
// pulling in the whole 600-line popup (eight inline SVGs).
//
// Bump WELCOME_VERSION when slide content changes in a way readers should
// see again. Cosmetic fixes — leave it; the popup stays dismissed.
export const WELCOME_VERSION = '2026-06-05-8'
export const WELCOME_STORAGE_KEY = 'tsc-welcome-dismissed-v'
