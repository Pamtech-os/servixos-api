/**
 * Stand-in testimonial shown in the owner's editor and previews. AI never
 * writes testimonials: an invented review on a public site would mislead
 * visitors, so this stays hidden publicly until the owner replaces it.
 */
export const TESTIMONIAL_PLACEHOLDER = {
  quote:
    'Placeholder — replace this with a real review from one of your customers.',
  author: 'Customer name',
  isPlaceholder: true,
} as const;
