/**
 * Expense categories a requester picks per request line.
 *
 * This is the single source of truth for both the picker on the request form
 * and the labels the financial reports read back, so a category can never be
 * spelled one way when it is chosen and another when it is reported on.
 */
import { RequestCategory } from '../types';

export const CATEGORY_OPTIONS: { value: RequestCategory; label: string; description: string; defaultUnit: string }[] = [
  // Core float categories
  { value: 'PROCUREMENT',         label: 'Procurement / Items',            description: 'Purchase of goods, supplies or equipment',                     defaultUnit: 'EACH'     },
  { value: 'TRANSPORT',           label: 'Transport',                      description: 'Travel costs, fuel, vehicle hire',                              defaultUnit: 'TRIP'     },
  { value: 'ACCOMMODATION',       label: 'Accommodation',                  description: 'Hotel, lodging, housing costs',                                 defaultUnit: 'NIGHT'    },
  { value: 'REIMBURSEMENT',       label: 'Reimbursement',                  description: 'Reimbursement for stakeholders or staff',                       defaultUnit: 'LUMPSUM'  },
  { value: 'PER_DIEM',            label: 'Per Diem / Allowances',          description: 'Daily allowances, per diem for field staff',                    defaultUnit: 'DAY'      },
  { value: 'TRAINING',            label: 'Training / Workshop',            description: 'Training costs, workshop facilitation',                         defaultUnit: 'SESSION'  },
  { value: 'MAINTENANCE',         label: 'Maintenance / Repairs',          description: 'Equipment repairs, service costs',                              defaultUnit: 'SERVICE'  },
  // NGO-specific categories
  { value: 'CAPACITY_BUILDING',   label: 'Capacity Building',              description: 'Staff capacity strengthening, institutional development',       defaultUnit: 'SESSION'  },
  { value: 'COMMUNITY_OUTREACH',  label: 'Community Outreach',             description: 'Community mobilisation, awareness campaigns',                   defaultUnit: 'EVENT'    },
  { value: 'FIELD_OPERATIONS',    label: 'Field Operations & Logistics',   description: 'Field mission costs, operational logistics',                    defaultUnit: 'TRIP'     },
  { value: 'MEAL',                label: 'Monitoring, Evaluation & Learning (MEAL)', description: 'M&E activities, data collection, surveys',             defaultUnit: 'ACTIVITY' },
  { value: 'RESEARCH',            label: 'Research & Documentation',       description: 'Research, reporting, documentation costs',                      defaultUnit: 'LUMPSUM'  },
  { value: 'ADVOCACY',            label: 'Advocacy & Communications',      description: 'Advocacy campaigns, media, publications',                       defaultUnit: 'LUMPSUM'  },
  { value: 'BENEFICIARY_SUPPORT', label: 'Beneficiary Support',            description: 'Direct support to beneficiaries, cash transfers',               defaultUnit: 'PERSON'   },
  { value: 'IT_SYSTEMS',          label: 'IT & Systems',                   description: 'Technology, software, ICT equipment',                           defaultUnit: 'EACH'     },
  { value: 'OFFICE_SUPPLIES',     label: 'Office Supplies & Consumables',  description: 'Stationery, consumables, printing',                             defaultUnit: 'EACH'     },
  { value: 'UTILITIES',           label: 'Utilities & Internet',           description: 'Electricity, water, internet bills',                            defaultUnit: 'MONTH'    },
  { value: 'VEHICLE_FLEET',       label: 'Vehicle Fleet',                  description: 'Vehicle maintenance, fuel, fleet management',                   defaultUnit: 'SERVICE'  },
  { value: 'SECURITY',            label: 'Security Services',              description: 'Security guarding, surveillance, alarms',                       defaultUnit: 'MONTH'    },
  { value: 'STAFF_WELFARE',       label: 'Staff Welfare',                  description: 'Staff wellbeing, medical, team-building',                       defaultUnit: 'LUMPSUM'  },
  { value: 'AUDIT_COMPLIANCE',    label: 'Audit & Compliance',             description: 'External audits, compliance reviews',                           defaultUnit: 'SERVICE'  },
  { value: 'LEGAL_CONSULTANCY',   label: 'Legal & Consultancy',            description: 'Legal fees, professional consultancy',                          defaultUnit: 'SERVICE'  },
  { value: 'SUBSCRIPTIONS',       label: 'Subscriptions & Memberships',    description: 'Annual subscriptions, membership fees',                         defaultUnit: 'YEAR'     },
  { value: 'OTHER',               label: 'Other',                          description: 'Any other expenditure type',                                    defaultUnit: 'EACH'     }
];

/** Human label for a stored category code, tolerating anything unrecognised. */
export const categoryLabel = (value?: string | null): string => {
  if (!value) return 'Uncategorised';
  const known = CATEGORY_OPTIONS.find((c) => c.value === value);
  if (known) return known.label;
  // Costs added during reconciliation are grouped under their own bucket, and
  // an older or hand-entered code should still read as words rather than SQL.
  if (value === 'ADDITIONAL_COSTS') return 'Additional Costs (at reconciliation)';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
};
