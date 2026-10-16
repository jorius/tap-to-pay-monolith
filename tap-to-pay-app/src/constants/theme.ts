import type { AppRole } from '@/config/role';

// Colour convention of SDD section 3: one hue per party, shared by every diagram and button.
export const Brand = {
  buyer: '#0E9F8F',
  buyerWallet: '#3B4FD8',
  vendor: '#E07A1F',
  vendorWallet: '#C0392B',
  service: '#6B2FB3',
  postgres: '#6B7280',
  interledger: '#B8860B',
  ok: '#17845A',
  bad: '#BE3535',
} as const;

// The 700 tones of the role colours: white text on them meets AA contrast (design, Builds frame).
export const Fill = { vendor: '#B85E10', buyer: '#0B7A6E', service: '#6B2FB3' } as const;

export const Colors = {
  light: {
    text: '#111827',
    muted: '#4B5563',
    background: '#FFFFFF',
    card: '#F3F4F6',
    border: '#D1D5DB',
    vendorInk: '#A04F0C',
    buyerInk: '#0A6E63',
    vendorTint: '#FDF0E4',
    buyerTint: '#E3F5F2',
    okInk: '#126B49',
    badInk: '#BE3535',
    badTint: '#FBEAEA',
    idle: '#E5E7EB',
  },
  dark: {
    text: '#F3F4F6',
    muted: '#9CA3AF',
    background: '#0B0F14',
    card: '#161B22',
    border: '#30363D',
    vendorInk: '#F5A35B',
    buyerInk: '#3DD6C3',
    vendorTint: '#2A1A0C',
    buyerTint: '#0C2724',
    okInk: '#4ADE9B',
    badInk: '#F27A7A',
    badTint: '#3A1616',
    idle: '#30363D',
  },
} as const;

export type Palette = (typeof Colors)[keyof typeof Colors];

export function roleColors(theme: Palette, role: AppRole) {
  return role === 'vendor'
    ? { brand: Brand.vendor, fill: Fill.vendor, ink: theme.vendorInk, tint: theme.vendorTint }
    : { brand: Brand.buyer, fill: Fill.buyer, ink: theme.buyerInk, tint: theme.buyerTint };
}
