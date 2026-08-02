/**
 * Open Source License Guide Service
 *
 * Core business logic for the Open Source License Guide module.
 * Handles license querying, filtering, comparison, recommendations,
 * and compatibility checking.
 */
import {
  compatibilityMatrix,
  licenses,
  useCaseGuidance,
} from './data.js';
import type {
  License,
  LicenseCategory,
  LicenseComparison,
  LicenseCompatibility,
  LicenseFilter,
  LicenseGuideMeta,
  LicensesApiResponse,
  UseCase,
} from './types.js';

/** Pagination defaults */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;

/**
 * Get all licenses with optional filtering.
 */
export function getLicenses(
  filter?: LicenseFilter,
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT
): LicensesApiResponse<License[]> {
  let filtered = [...licenses];

  if (filter) {
    // Filter by category
    if (filter.category) {
      filtered = filtered.filter((l) => l.category === filter.category);
    }

    // Filter by use case suitability
    if (filter.useCase) {
      filtered = filtered.filter(
        (l) => l.useCaseSuitability[filter.useCase!] !== 'restricted'
      );
    }

    // Text search (name, fullName, description, tags)
    if (filter.search) {
      const q = filter.search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.fullName.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q) ||
          l.spdxId.toLowerCase().includes(q) ||
          l.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Permissions filters
    if (filter.allowsCommercial !== undefined) {
      filtered = filtered.filter((l) => l.permissions.commercialUse === filter.allowsCommercial);
    }
    if (filter.allowsModification !== undefined) {
      filtered = filtered.filter((l) => l.permissions.modification === filter.allowsModification);
    }

    // Conditions filters
    if (filter.requiresDisclosure !== undefined) {
      filtered = filtered.filter((l) => l.conditions.discloseSource === filter.requiresDisclosure);
    }
    if (filter.requiresSameLicense !== undefined) {
      filtered = filtered.filter((l) => l.conditions.sameLicense === filter.requiresSameLicense);
    }

    // Popularity filter
    if (filter.popularity) {
      filtered = filtered.filter((l) => l.popularity === filter.popularity);
    }

    // Tag filter
    if (filter.tags && filter.tags.length > 0) {
      filtered = filtered.filter((l) =>
        filter.tags!.some((tag) => l.tags.includes(tag))
      );
    }
  }

  // Pagination
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (safePage - 1) * limit;
  const paginated = filtered.slice(startIndex, startIndex + limit);

  return {
    status: 'success',
    data: paginated,
    pagination: {
      page: safePage,
      limit,
      total,
      totalPages,
    },
  };
}

/**
 * Get a single license by its ID.
 */
export function getLicenseById(id: string): LicensesApiResponse<License> {
  const license = licenses.find((l) => l.id === id);
  if (!license) {
    return {
      status: 'error',
      error: `License '${id}' not found`,
    };
  }
  return {
    status: 'success',
    data: license,
  };
}

/**
 * Get licenses by SPDX identifier.
 */
export function getLicenseBySpdxId(spdxId: string): LicensesApiResponse<License> {
  const license = licenses.find((l) => l.spdxId === spdxId);
  if (!license) {
    return {
      status: 'error',
      error: `License with SPDX ID '${spdxId}' not found`,
    };
  }
  return {
    status: 'success',
    data: license,
  };
}

/**
 * Get all available license categories.
 */
export function getCategories(): LicensesApiResponse<{ category: LicenseCategory; count: number }[]> {
  const counts: Record<string, number> = {};
  for (const license of licenses) {
    counts[license.category] = (counts[license.category] || 0) + 1;
  }
  const data = Object.entries(counts).map(([category, count]) => ({
    category: category as LicenseCategory,
    count,
  }));
  return { status: 'success', data };
}

/**
 * Compare two licenses and generate a detailed comparison.
 */
export function compareLicenses(licenseAId: string, licenseBId: string): LicensesApiResponse<LicenseComparison> {
  const a = licenses.find((l) => l.id === licenseAId);
  const b = licenses.find((l) => l.id === licenseBId);

  if (!a || !b) {
    const missing: string[] = [];
    if (!a) missing.push(licenseAId);
    if (!b) missing.push(licenseBId);
    return {
      status: 'error',
      error: `License(s) not found: ${missing.join(', ')}`,
    };
  }

  // Find compatibility
  let compatibility: LicenseCompatibility = {
    licenseA: a.id,
    licenseB: b.id,
    compatibility: 'conditional',
    conditions: 'No explicit compatibility data. Legal review recommended.',
  };

  // Check both directions
  const directMatch =
    compatibilityMatrix.find(
      (c) =>
        (c.licenseA === a.id && c.licenseB === b.id) ||
        (c.licenseA === b.id && c.licenseB === a.id)
    );
  if (directMatch) {
    compatibility = {
      licenseA: a.id,
      licenseB: b.id,
      compatibility: directMatch.compatibility,
      conditions: directMatch.conditions,
    };
  }

  // Find similarities
  const similarities: string[] = [];
  if (a.category === b.category) {
    similarities.push(`Both are ${a.category} licenses`);
  }
  if (a.permissions.commercialUse === b.permissions.commercialUse) {
    similarities.push('Both allow commercial use');
  }
  if (a.permissions.modification === b.permissions.modification) {
    similarities.push('Both allow modification');
  }
  if (a.conditions.includeCopyright === b.conditions.includeCopyright) {
    similarities.push('Both require copyright notice retention');
  }
  if (a.conditions.discloseSource === b.conditions.discloseSource) {
    similarities.push(a.conditions.discloseSource
      ? 'Both require source disclosure'
      : 'Neither requires source disclosure');
  }
  if (a.conditions.sameLicense === b.conditions.sameLicense) {
    similarities.push(a.conditions.sameLicense
      ? 'Both require same-license distribution'
      : 'Neither requires same-license distribution');
  }

  // Find differences
  const differences: string[] = [];
  if (a.category !== b.category) {
    differences.push(`${a.name} is a ${a.category} license, while ${b.name} is ${b.category}`);
  }
  if (a.permissions.patentUse !== b.permissions.patentUse) {
    differences.push(a.permissions.patentUse
      ? `${a.name} includes an explicit patent grant; ${b.name} does not`
      : `${b.name} includes an explicit patent grant; ${a.name} does not`);
  }
  if (a.permissions.sublicense !== b.permissions.sublicense) {
    differences.push(a.permissions.sublicense
      ? `${a.name} allows sublicensing; ${b.name} does not`
      : `${b.name} allows sublicensing; ${a.name} does not`);
  }
  if (a.conditions.sameLicense !== b.conditions.sameLicense) {
    differences.push(a.conditions.sameLicense
      ? `${a.name} requires derivatives under the same license (copyleft); ${b.name} does not`
      : `${b.name} requires derivatives under the same license (copyleft); ${a.name} does not`);
  }
  if (a.conditions.discloseSource !== b.conditions.discloseSource) {
    differences.push(a.conditions.discloseSource
      ? `${a.name} requires source disclosure; ${b.name} does not`
      : `${b.name} requires source disclosure; ${a.name} does not`);
  }
  if (a.conditions.networkUseDisclosure !== b.conditions.networkUseDisclosure) {
    differences.push(a.conditions.networkUseDisclosure
      ? `${a.name} requires source disclosure for network use (SaaS); ${b.name} does not`
      : `${b.name} requires source disclosure for network use (SaaS); ${a.name} does not`);
  }

  // Generate recommendation
  const recommendation = generateComparisonRecommendation(a, b, compatibility);

  return {
    status: 'success',
    data: {
      licenseA: a,
      licenseB: b,
      similarities,
      differences,
      compatibility,
      recommendation,
    },
  };
}

/**
 * Get license recommendations for a specific use case.
 */
export function getRecommendations(useCase: UseCase): LicensesApiResponse<{
  useCase: string;
  description: string;
  topPicks: License[];
  warnings: string[];
}> {
  const guidance = useCaseGuidance[useCase];
  if (!guidance) {
    return {
      status: 'error',
      error: `Unknown use case: '${useCase}'`,
    };
  }

  const topPicks = guidance.topPicks
    .map((id) => licenses.find((l) => l.id === id))
    .filter((l): l is License => l !== undefined);

  return {
    status: 'success',
    data: {
      useCase,
      description: guidance.description,
      topPicks,
      warnings: guidance.warnings,
    },
  };
}

/**
 * Get all use cases with their guidance.
 */
export function getAllUseCases(): LicensesApiResponse<typeof useCaseGuidance> {
  return {
    status: 'success',
    data: useCaseGuidance,
  };
}

/**
 * Check compatibility between two license IDs.
 */
export function checkCompatibility(
  licenseAId: string,
  licenseBId: string
): LicensesApiResponse<LicenseCompatibility> {
  const a = licenses.find((l) => l.id === licenseAId);
  const b = licenses.find((l) => l.id === licenseBId);

  if (!a || !b) {
    const missing: string[] = [];
    if (!a) missing.push(licenseAId);
    if (!b) missing.push(licenseBId);
    return {
      status: 'error',
      error: `License(s) not found: ${missing.join(', ')}`,
    };
  }

  // Check both directions
  const match = compatibilityMatrix.find(
    (c) =>
      (c.licenseA === a.id && c.licenseB === b.id) ||
      (c.licenseA === b.id && c.licenseB === a.id)
  );

  if (match) {
    return {
      status: 'success',
      data: {
        licenseA: a.id,
        licenseB: b.id,
        compatibility: match.compatibility,
        conditions: match.conditions,
      },
    };
  }

  return {
    status: 'success',
    data: {
      licenseA: a.id,
      licenseB: b.id,
      compatibility: 'conditional',
      conditions: 'No explicit compatibility data. Legal review recommended.',
    },
  };
}

/**
 * Get guide metadata.
 */
export function getGuideMeta(): LicensesApiResponse<LicenseGuideMeta> {
  const categories = new Set<LicenseCategory>();
  const useCases = new Set<UseCase>();

  for (const license of licenses) {
    categories.add(license.category);
    for (const [useCase, _suitability] of Object.entries(license.useCaseSuitability)) {
      useCases.add(useCase as UseCase);
    }
  }

  return {
    status: 'success',
    data: {
      totalLicenses: licenses.length,
      categories: Array.from(categories),
      useCases: Array.from(useCases),
      lastUpdated: '2026-01-01',
      version: '1.0.0',
    },
  };
}

/**
 * Get licenses grouped by category.
 */
export function getLicensesByCategory(): LicensesApiResponse<Record<LicenseCategory, License[]>> {
  const grouped: Partial<Record<LicenseCategory, License[]>> = {};
  for (const license of licenses) {
    if (!grouped[license.category]) {
      grouped[license.category] = [];
    }
    grouped[license.category]!.push(license);
  }
  return {
    status: 'success',
    data: grouped as Record<LicenseCategory, License[]>,
  };
}

/**
 * Quick lookup: find suitable licenses based on a simple questionnaire.
 */
export function quickRecommend(
  wantsCommercial: boolean,
  wantsModifications: boolean,
  wantsPatentProtection: boolean,
  acceptsCopyleft: boolean,
  isLibrary: boolean
): LicensesApiResponse<License[]> {
  let candidates = [...licenses];

  // Must allow commercial use
  if (wantsCommercial) {
    candidates = candidates.filter((l) => l.permissions.commercialUse);
  }

  // Must allow modifications
  if (wantsModifications) {
    candidates = candidates.filter((l) => l.permissions.modification);
  }

  // Must have patent grant
  if (wantsPatentProtection) {
    candidates = candidates.filter((l) => l.permissions.patentUse);
  }

  // Filter by copyleft acceptance
  if (!acceptsCopyleft) {
    candidates = candidates.filter((l) => l.category === 'permissive' || l.category === 'public-domain');
  }

  // Filter for libraries
  if (isLibrary && acceptsCopyleft) {
    candidates = candidates.filter(
      (l) => l.category === 'permissive' || l.category === 'public-domain' || l.category === 'weak-copyleft'
    );
  }

  // Sort by popularity
  type PopularityLevel = 'very-high' | 'high' | 'medium' | 'low';
  const popularityRank: Record<PopularityLevel, number> = {
    'very-high': 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  candidates.sort(
    (a, b) => popularityRank[a.popularity as PopularityLevel] - popularityRank[b.popularity as PopularityLevel]
  );

  return {
    status: 'success',
    data: candidates,
  };
}

/**
 * Find licenses that are compatible with a given license.
 */
export function getCompatibleLicenses(licenseId: string): LicensesApiResponse<{ license: License; compatibility: LicenseCompatibility }[]> {
  const license = licenses.find((l) => l.id === licenseId);
  if (!license) {
    return {
      status: 'error',
      error: `License '${licenseId}' not found`,
    };
  }

  const results: { license: License; compatibility: LicenseCompatibility }[] = [];

  for (const other of licenses) {
    if (other.id === licenseId) continue;

    const match = compatibilityMatrix.find(
      (c) =>
        (c.licenseA === license.id && c.licenseB === other.id) ||
        (c.licenseA === other.id && c.licenseB === license.id)
    );

    results.push({
      license: other,
      compatibility: {
        licenseA: license.id,
        licenseB: other.id,
        compatibility: match?.compatibility ?? 'conditional',
        conditions: match?.conditions ?? 'No explicit compatibility data. Legal review recommended.',
      },
    });
  }

  // Sort: compatible first, then conditional, then incompatible
  const rank = { compatible: 0, conditional: 1, incompatible: 2 };
  results.sort((a, b) => rank[a.compatibility.compatibility] - rank[b.compatibility.compatibility]);

  return {
    status: 'success',
    data: results,
  };
}

// ---- Helpers ----

/**
 * Generate a human-readable comparison recommendation.
 */
function generateComparisonRecommendation(
  a: License,
  b: License,
  compat: LicenseCompatibility
): string {
  if (compat.compatibility === 'incompatible') {
    return `${a.name} and ${b.name} are **incompatible**. You cannot combine code under these licenses in the same project. Consider using one license only, or switching to a compatible alternative.`;
  }
  if (compat.compatibility === 'conditional') {
    return `${a.name} and ${b.name} have conditional compatibility. ${compat.conditions || 'Legal review is recommended before combining these licenses.'}`;
  }
  // compatible
  if (a.conditions.sameLicense || b.conditions.sameLicense) {
    return `${a.name} and ${b.name} are compatible. However, if one requires same-license distribution (copyleft), the combined work must be distributed under that license. ${compat.conditions || ''}`;
  }
  return `${a.name} and ${b.name} are compatible. Both are permissive licenses that can be freely combined. ${compat.conditions || ''}`;
}

export default {
  getLicenses,
  getLicenseById,
  getLicenseBySpdxId,
  getCategories,
  compareLicenses,
  getRecommendations,
  getAllUseCases,
  checkCompatibility,
  getGuideMeta,
  getLicensesByCategory,
  quickRecommend,
  getCompatibleLicenses,
};
