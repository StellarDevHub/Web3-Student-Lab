/**
 * Open Source License Guide Types
 *
 * Defines the structure for license information used throughout the
 * User Dashboard's Open Source License Guide module.
 */

/** The main categories of open source licenses */
export type LicenseCategory = 'permissive' | 'copyleft' | 'weak-copyleft' | 'network-copyleft' | 'public-domain' | 'other';

/** Compatibility level between two licenses */
export type CompatibilityLevel = 'compatible' | 'conditional' | 'incompatible';

/** Use case recommendation for a license */
export type UseCase = 'personal' | 'commercial' | 'saas' | 'library' | 'documentation' | 'educational';

/** Whether a license is suitable for a given use case */
export type Suitability = 'recommended' | 'possible' | 'not-recommended' | 'restricted';

/** Permissions granted by a license */
export interface LicensePermissions {
  commercialUse: boolean;
  modification: boolean;
  distribution: boolean;
  privateUse: boolean;
  patentUse: boolean;
  trademarkUse: boolean;
  sublicense: boolean;
  warranty: boolean;
}

/** Conditions required by a license */
export interface LicenseConditions {
  includeCopyright: boolean;
  includeLicense: boolean;
  stateChanges: boolean;
  discloseSource: boolean;
  sameLicense: boolean;
  includeNotice: boolean;
  includeInstallInstructions: boolean;
  networkUseDisclosure: boolean;
}

/** Limitations of a license */
export interface LicenseLimitations {
  liability: boolean;
  warranty: boolean;
  trademark: boolean;
  patentRetaliation: boolean;
  useRestriction: boolean;
}

/** Compatibility information between two licenses */
export interface LicenseCompatibility {
  licenseA: string;
  licenseB: string;
  compatibility: CompatibilityLevel;
  conditions?: string;
}

/** A full license entry in the guide */
export interface License {
  id: string;
  name: string;
  fullName: string;
  spdxId: string;
  category: LicenseCategory;
  description: string;
  summary: string;
  permissions: LicensePermissions;
  conditions: LicenseConditions;
  limitations: LicenseLimitations;
  useCaseSuitability: Record<UseCase, Suitability>;
  popularity: 'very-high' | 'high' | 'medium' | 'low';
  recommendedFor: string[];
  notRecommendedFor: string[];
  url: string;
  version?: string;
  year?: string;
  jurisdiction?: string;
  tags: string[];
}

/** Filter parameters for querying licenses */
export interface LicenseFilter {
  category?: LicenseCategory;
  useCase?: UseCase;
  search?: string;
  allowsCommercial?: boolean;
  allowsModification?: boolean;
  requiresDisclosure?: boolean;
  requiresSameLicense?: boolean;
  popularity?: string;
  tags?: string[];
}

/** Comparison result between two licenses */
export interface LicenseComparison {
  licenseA: License;
  licenseB: License;
  similarities: string[];
  differences: string[];
  compatibility: LicenseCompatibility;
  recommendation: string;
}

/** Guide metadata */
export interface LicenseGuideMeta {
  totalLicenses: number;
  categories: LicenseCategory[];
  useCases: UseCase[];
  lastUpdated: string;
  version: string;
}

/** API response wrapper */
export interface LicensesApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
