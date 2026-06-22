/**
 * Line icons for the reason tags. Stroke-based so they inherit the tag's
 * currentColor — gold accent at rest, button-text when the tag is selected.
 * Icon set mirrors the design artifact exactly.
 */

export type TagIconName =
  | 'food'
  | 'wait'
  | 'service'
  | 'clean'
  | 'ambiance'
  | 'value'
  | 'price'
  | 'other';

interface Props {
  name: TagIconName;
}

const COMMON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function TagIcon({ name }: Props) {
  switch (name) {
    case 'food':
      // Fork & knife — reads as "food" far better than the old coffee cup.
      return (
        <svg {...COMMON} aria-hidden="true">
          <path d="M4 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3" />
          <path d="M6 12v9" />
          <path d="M17 3a3 3 0 0 0-3 3v6h3" />
          <path d="M17 3v18" />
        </svg>
      );
    case 'wait':
      return (
        <svg {...COMMON} aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'service':
      // Concierge bell — "service" instead of a generic person.
      return (
        <svg {...COMMON} aria-hidden="true">
          <path d="M4 18h16" />
          <path d="M5 18a7 7 0 0 1 14 0" />
          <path d="M12 6v5" />
          <path d="M10 6h4" />
        </svg>
      );
    case 'clean':
      // Spray bottle — a checkmark for "Not clean" was misleading.
      return (
        <svg {...COMMON} aria-hidden="true">
          <path d="M9 3h4v3H9z" />
          <path d="M9 6h4l1 4H8z" />
          <path d="M8 10h6v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z" />
          <path d="M13 4h3l2 2" />
          <path d="M18 6v2" />
        </svg>
      );
    case 'ambiance':
      // Candle — a warmer "atmosphere" cue than a utility lightbulb.
      return (
        <svg {...COMMON} aria-hidden="true">
          <path d="M12 2.5c1.6 2 2.4 3.2 2.4 4.4a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2.4 2.4-4.4z" />
          <rect x="8.5" y="9.5" width="7" height="11.5" rx="1.6" />
          <path d="M8.5 13.5h7" />
        </svg>
      );
    case 'value':
    case 'price':
      return (
        <svg {...COMMON} aria-hidden="true">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case 'other':
      // Ellipsis — neutral "something else", not an alert.
      return (
        <svg {...COMMON} aria-hidden="true">
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </svg>
      );
  }
}
