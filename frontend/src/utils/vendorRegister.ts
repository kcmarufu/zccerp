/**
 * Supplier register — the category list and how the anti-terrorism check reads.
 */

import { ProcVendor } from '../types';

export const VENDOR_CATEGORIES = [
  'Accommodation & Hotels',
  'Agricultural Inputs & Livestock',
  'Audit & Accounting Services',
  'Banking & Financial Services',
  'Branding, Printing & Stationery',
  'Catering & Food Supplies',
  'Cleaning & Hygiene Supplies',
  'Communications & Airtime',
  'Conference & Event Venues',
  'Construction & Building Materials',
  'Consultancy & Professional Services',
  'Courier & Postal Services',
  'Electrical & Solar Equipment',
  'Food & Beverage',
  'Fuel & Lubricants',
  'Furniture & Fittings',
  'Hardware & Tools',
  'Humanitarian Relief Items',
  'Insurance',
  'Internet & Connectivity',
  'IT Equipment',
  'IT Services & Software',
  'Legal Services',
  'Media & Advertising',
  'Medical',
  'Motor Vehicle Repairs & Spares',
  'Office Equipment',
  'Office Supplies',
  'Protective Clothing & Uniforms',
  'Publishing & Translation',
  'Rentals & Property',
  'Security Services',
  'Training',
  'Transport',
  'Travel Agents & Air Tickets',
  'Tyres & Batteries',
  'Utilities (Water, Electricity)',
  'Vehicle Hire',
  'Vehicles',
  'Water & Sanitation Equipment',
  'Other',
];

/** getVendors category filter for suppliers with no category yet. */
export const UNCATEGORIZED = '__UNCATEGORIZED__';

export const ANTI_TERROR_CHECK_LABEL = 'Anti-terrorism check';

type AntiTerrorStatus = boolean | number | null | undefined;

/** Only a recorded pass reads as verified; a check nobody recorded has not passed. */
export const isAntiTerrorVerified = (status: AntiTerrorStatus): boolean => Number(status) === 1;

export const antiTerrorLabel = (status: AntiTerrorStatus): string =>
  isAntiTerrorVerified(status) ? 'Verified' : 'Not verified';

/** A supplier may not go on a quotation until both of these are recorded. */
export const isVendorComplete = (vendor: Partial<ProcVendor>): boolean =>
  Boolean(vendor.category) && vendor.antiterror_verified !== null && vendor.antiterror_verified !== undefined;
