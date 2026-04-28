// Business Categories Seed
// ─────────────────────────────────────────────────────────────────────────────
// Paste this into MongoDB Compass › mongosh tab, or run from the terminal:
//   mongosh "<DATABASE_URL>" --file src/database/seed.mongo.js
//
// Safe to run multiple times — duplicates are skipped via the unique slug index.
// ─────────────────────────────────────────────────────────────────────────────

const BUSINESS_CATEGORIES = [
  { name: 'Cleaning Services',          slug: 'cleaning-services',          isActive: true },
  { name: 'Plumbing',                   slug: 'plumbing',                   isActive: true },
  { name: 'Electrical',                 slug: 'electrical',                 isActive: true },
  { name: 'Landscaping & Gardening',    slug: 'landscaping-gardening',      isActive: true },
  { name: 'HVAC',                       slug: 'hvac',                       isActive: true },
  { name: 'Painting',                   slug: 'painting',                   isActive: true },
  { name: 'Carpentry & Woodwork',       slug: 'carpentry-woodwork',         isActive: true },
  { name: 'Roofing',                    slug: 'roofing',                    isActive: true },
  { name: 'Pest Control',               slug: 'pest-control',               isActive: true },
  { name: 'Moving & Hauling',           slug: 'moving-hauling',             isActive: true },
  { name: 'Auto Repair & Maintenance',  slug: 'auto-repair-maintenance',    isActive: true },
  { name: 'Beauty & Hair Salon',        slug: 'beauty-hair-salon',          isActive: true },
  { name: 'Barber Shop',                slug: 'barber-shop',                isActive: true },
  { name: 'Nail Salon',                 slug: 'nail-salon',                 isActive: true },
  { name: 'Massage & Spa',              slug: 'massage-spa',                isActive: true },
  { name: 'Personal Training & Fitness',slug: 'personal-training-fitness',  isActive: true },
  { name: 'Photography & Videography',  slug: 'photography-videography',    isActive: true },
  { name: 'Event Planning',             slug: 'event-planning',             isActive: true },
  { name: 'Catering',                   slug: 'catering',                   isActive: true },
  { name: 'Tutoring & Education',       slug: 'tutoring-education',         isActive: true },
  { name: 'IT Support & Tech Services', slug: 'it-support-tech-services',   isActive: true },
  { name: 'Accounting & Bookkeeping',   slug: 'accounting-bookkeeping',     isActive: true },
  { name: 'Legal Services',             slug: 'legal-services',             isActive: true },
  { name: 'Healthcare & Wellness',      slug: 'healthcare-wellness',        isActive: true },
  { name: 'Childcare & Babysitting',    slug: 'childcare-babysitting',      isActive: true },
  { name: 'Pet Care & Grooming',        slug: 'pet-care-grooming',          isActive: true },
  { name: 'Security Services',          slug: 'security-services',          isActive: true },
  { name: 'Interior Design',            slug: 'interior-design',            isActive: true },
  { name: 'Tailoring & Fashion',        slug: 'tailoring-fashion',          isActive: true },
  { name: 'Delivery & Courier',         slug: 'delivery-courier',           isActive: true },
];

(function seedBusinessCategories() {
  const now = new Date();
  const docs = BUSINESS_CATEGORIES.map(c => ({ ...c, createdAt: now, updatedAt: now }));

  try {
    const result = db.business_categories.insertMany(docs, { ordered: false });
    print(`Business categories — inserted: ${result.insertedCount}, skipped: 0`);
  } catch (e) {
    // ordered:false continues past duplicate-key errors (code 11000)
    if (e.code === 11000 || (e.writeErrors && e.writeErrors.length)) {
      const skipped = e.writeErrors ? e.writeErrors.length : 0;
      const inserted = docs.length - skipped;
      print(`Business categories — inserted: ${inserted}, skipped (already existed): ${skipped}`);
    } else {
      throw e;
    }
  }
})();
