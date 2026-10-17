import type { AppRole } from '@/config/role';

// Paynela design system (prompts/30): teal for navigation, calls to action and primary actions; amber only as an
// accent. Both builds share these colours.
export const Brand = {
  tealDark: '#004C50',
  teal: '#02787D',
  tealLight: '#009398',
  caramelDark: '#8F3D02',
  amber: '#CC6509',
  amberLight: '#EB8E18',
} as const;

// Solid fills under white text (pills, badges, buttons): each keeps 4.5:1 in light and dark mode.
export const Fills = {
  primary: Brand.teal,
  income: '#16845C',
  outflow: '#C44949',
  // The spec's refused grey #899396 reads at 3.1:1 under white text; this is the nearest grey that passes AA.
  refused: '#66777A',
  pending: Brand.caramelDark,
} as const;

export const Colors = {
  light: {
    background: '#FAFBFB',
    surface: '#FFFFFF',
    text: '#172D30',
    // The spec's #748487 reads at 3.8:1 on the background; darkened to pass AA for body text.
    muted: '#66777A',
    border: '#E6ECEB',
    primaryInk: '#02787D',
    primaryTint: '#E7F5F3',
    accentInk: '#8F3D02',
    accentTint: '#FFF3E3',
    // Money: green in, red out, grey refused. Brand colours never stand in for these.
    income: '#16845C',
    outflow: '#C44949',
    refused: '#66777A',
    idle: '#D5DEDD',
  },
  dark: {
    background: '#0D1719',
    surface: '#152225',
    text: '#E8F0EF',
    muted: '#93A4A6',
    border: '#24373A',
    primaryInk: '#36C2C6',
    primaryTint: '#0F2E30',
    accentInk: '#F2A547',
    accentTint: '#2E2110',
    income: '#4CC38F',
    outflow: '#F07F7F',
    refused: '#93A4A6',
    idle: '#24373A',
  },
} as const;

export type Palette = (typeof Colors)[keyof typeof Colors];

// Kept for its call sites: both roles now share the brand's teal (fill for buttons, ink for text, tint for active).
export function roleColors(theme: Palette, role: AppRole) {
  void role;
  return { brand: Brand.teal, fill: Fills.primary, ink: theme.primaryInk, tint: theme.primaryTint };
}
