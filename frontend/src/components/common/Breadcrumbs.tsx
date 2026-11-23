"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

/**
 * Dynamic Breadcrumb Navigation with Schema.org JSON-LD Metadata (#1147).
 *
 * Renders accessible breadcrumb navigation from the current URL path,
 * with Schema.org BreadcrumbList structured data for SEO.
 *
 * Usage:
 *   <Breadcrumbs />
 */

interface BreadcrumbItem {
  label: string;
  href: string;
}

/** Human-readable labels for known path segments. */
const PATH_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  courses: "Courses",
  lessons: "Lessons",
  certificates: "Certificates",
  savings: "Savings",
  settings: "Settings",
  profile: "Profile",
  admin: "Admin",
  leaderboard: "Leaderboard",
  quiz: "Quiz",
  blockchain: "Blockchain",
  explorer: "Explorer",
};

function formatLabel(segment: string): string {
  // Check known labels first
  if (PATH_LABELS[segment]) return PATH_LABELS[segment];
  // Format: replace hyphens/underscores with spaces, title case
  return segment
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Breadcrumbs() {
  const pathname = usePathname();

  const breadcrumbs = useMemo((): BreadcrumbItem[] => {
    if (!pathname || pathname === "/") return [];

    const segments = pathname.split("/").filter(Boolean);
    const items: BreadcrumbItem[] = [];

    let currentPath = "";
    for (const segment of segments) {
      currentPath += `/${segment}`;
      items.push({
        label: formatLabel(segment),
        href: currentPath,
      });
    }

    return items;
  }, [pathname]);

  if (breadcrumbs.length === 0) return null;

  // Schema.org BreadcrumbList structured data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: `${typeof window !== "undefined" ? window.location.origin : ""}${item.href}`,
    })),
  };

  return (
    <nav aria-label="Breadcrumb" className="py-2">
      {/* Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <ol className="flex items-center space-x-2 text-sm text-gray-600">
        {/* Home */}
        <li>
          <Link
            href="/"
            className="hover:text-blue-600 transition-colors"
          >
            Home
          </Link>
        </li>

        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <li key={item.href} className="flex items-center space-x-2">
              <span className="text-gray-400" aria-hidden="true">
                /
              </span>
              {isLast ? (
                <span
                  className="text-gray-900 font-medium"
                  aria-current="page"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="hover:text-blue-600 transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
