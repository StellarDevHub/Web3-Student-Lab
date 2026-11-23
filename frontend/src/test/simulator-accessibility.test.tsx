/**
 * Accessibility tests for the interactive simulators.
 *
 * Covers the WCAG 2.1 AA requirements from the simulator accessibility
 * milestone: axe-core scans for critical/serious violations, aria-live
 * announcements for real-time updates, and keyboard operability (focus
 * management + Escape dismissal) for the slide-out node detail dialog.
 *
 * Run:  npm test
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Module mocks – must appear before any component imports
// ---------------------------------------------------------------------------

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    // jsdom has no matchMedia, so useReducedMotion would throw – stub it.
    useReducedMotion: () => false,
    motion: {
      div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
  };
});

// ---------------------------------------------------------------------------
// Import components after mocks are set up
// ---------------------------------------------------------------------------
import { BlockchainExplorer } from "@/components/simulator/BlockchainExplorer";
import { NodeDetailPanel } from "@/components/simulator/NodeDetailPanel";
import { ResourceGauge } from "@/components/simulator/ResourceGauge";
import type { NetworkNode } from "@/lib/visualization/ForceSimulation";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockNode: NetworkNode = {
  id: "GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT",
  type: "account",
  label: "Test Account",
};

// ---------------------------------------------------------------------------
// 1. BlockchainExplorer – live region + axe scan
// ---------------------------------------------------------------------------
describe("BlockchainExplorer – live updates and automated scan", () => {
  it("announces ledger updates via an aria-live region", () => {
    render(<BlockchainExplorer />);
    const table = screen.getByRole("table", { name: /transaction list/i });
    expect(table).toHaveAttribute("aria-live", "polite");
  });

  it("exposes the connection status to assistive technology", () => {
    render(<BlockchainExplorer />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("has no axe violations", async () => {
    const { container } = render(<BlockchainExplorer />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// 2. ResourceGauge – live value announcement + axe scan
// ---------------------------------------------------------------------------
describe("ResourceGauge – live value announcements and automated scan", () => {
  it("announces value changes through a polite live region", () => {
    render(<ResourceGauge label="CPU" value={62} max={100} warningAt={70} criticalAt={90} />);
    expect(screen.getByText("CPU: 62%")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("labels the canvas as a graphical object", () => {
    render(<ResourceGauge label="CPU" value={62} max={100} warningAt={70} criticalAt={90} />);
    expect(screen.getByRole("img", { name: /cpu resource gauge/i })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <ResourceGauge label="CPU" value={62} max={100} warningAt={70} criticalAt={90} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// 3. NodeDetailPanel – dialog focus management + Escape dismissal
// ---------------------------------------------------------------------------
describe("NodeDetailPanel – keyboard operability", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
  });

  it("moves focus to the close button when the dialog opens", () => {
    render(<NodeDetailPanel node={mockNode} onClose={onClose} />);
    expect(screen.getByRole("button", { name: /close account details panel/i })).toHaveFocus();
  });

  it("closes the dialog when Escape is pressed", () => {
    render(<NodeDetailPanel node={mockNode} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps Tab focus within the dialog", () => {
    render(<NodeDetailPanel node={mockNode} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");

    // Focus the last focusable element (View on Explorer)…
    const viewButton = screen.getByRole("button", { name: /view account .* on stellar explorer/i });
    viewButton.focus();
    expect(viewButton).toHaveFocus();

    // …and Tab should wrap back to the first focusable element (close).
    fireEvent.keyDown(dialog, { key: "Tab", code: "Tab" });
    expect(screen.getByRole("button", { name: /close account details panel/i })).toHaveFocus();
  });

  it("marks the dialog as modal for assistive technology", () => {
    render(<NodeDetailPanel node={mockNode} onClose={onClose} />);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("has no axe violations", async () => {
    const { container } = render(<NodeDetailPanel node={mockNode} onClose={onClose} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
