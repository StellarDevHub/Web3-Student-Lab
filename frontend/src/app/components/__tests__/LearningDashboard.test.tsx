import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LearningDashboard } from "../LearningDashboard";
import { storageKeys } from "../../curriculum-data";
import { learningAPI } from "@/lib/learning-api";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "student-1", email: "student@example.com" },
    token: "mock-token",
    isAuthenticated: true,
    isLoading: false,
  })),
}));

vi.mock("@/components/social/SocialIdentityPanel", () => ({
  SocialIdentityPanel: () => <div data-testid="social-identity-panel" />,
}));

vi.mock("../CompletionCelebration", () => ({
  CompletionModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="completion-modal">
      <button onClick={onClose}>Close</button>
    </div>
  ),
  launchCompletionConfetti: vi.fn(),
}));

vi.mock("@/lib/learning-api", () => ({
  learningAPI: {
    getOverallProgress: vi.fn(),
    syncOverallProgress: vi.fn(),
  },
}));

describe("LearningDashboard Synchronization", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("reads from local storage fallback immediately", async () => {
    localStorage.setItem(
      storageKeys.completed,
      JSON.stringify(["blockchain-foundations:blocks"])
    );
    localStorage.setItem(
      storageKeys.bookmarks,
      JSON.stringify(["blockchain-foundations:blocks"])
    );

    (learningAPI.getOverallProgress as any).mockResolvedValueOnce({
      completedLessons: ["blockchain-foundations:blocks"],
      bookmarks: ["blockchain-foundations:blocks"],
    });

    render(<LearningDashboard />);

    expect(screen.getByText("★ Starred")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("connects to GET /api/v1/learning/progress and syncs saved progress on new device", async () => {
    // New device has empty localStorage
    expect(localStorage.getItem(storageKeys.completed)).toBeNull();
    expect(localStorage.getItem(storageKeys.bookmarks)).toBeNull();

    // Backend returns authenticated user's records from another device
    (learningAPI.getOverallProgress as any).mockResolvedValueOnce({
      completedLessons: ["blockchain-foundations:blocks"],
      bookmarks: ["blockchain-foundations:blocks"],
    });

    render(<LearningDashboard />);

    await waitFor(() => {
      expect(learningAPI.getOverallProgress).toHaveBeenCalled();
    });

    await waitFor(() => {
      // Acceptance criteria: Logging in on another device displays the user's saved lesson progress and bookmarks immediately
      expect(screen.getByText("★ Starred")).toBeInTheDocument();
      expect(screen.getByText("Completed")).toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem(storageKeys.completed)!)).toContain(
        "blockchain-foundations:blocks"
      );
      expect(JSON.parse(localStorage.getItem(storageKeys.bookmarks)!)).toContain(
        "blockchain-foundations:blocks"
      );
    });
  });

  it("merges local offline progress with backend and pushes updates to database", async () => {
    // Local offline state before sync
    localStorage.setItem(
      storageKeys.completed,
      JSON.stringify(["blockchain-foundations:blocks"])
    );

    // Backend has another lesson completed from elsewhere
    (learningAPI.getOverallProgress as any).mockResolvedValueOnce({
      completedLessons: ["blockchain-foundations:wallets"],
      bookmarks: ["blockchain-foundations:wallets"],
    });
    (learningAPI.syncOverallProgress as any).mockResolvedValueOnce({
      completedLessons: [
        "blockchain-foundations:blocks",
        "blockchain-foundations:wallets",
      ],
      bookmarks: ["blockchain-foundations:wallets"],
    });

    render(<LearningDashboard />);

    await waitFor(() => {
      // Local additions merged with backend data
      const stored = JSON.parse(localStorage.getItem(storageKeys.completed)!);
      expect(stored).toContain("blockchain-foundations:blocks");
      expect(stored).toContain("blockchain-foundations:wallets");
    });

    await waitFor(() => {
      expect(learningAPI.syncOverallProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          completedLessons: expect.arrayContaining([
            "blockchain-foundations:blocks",
            "blockchain-foundations:wallets",
          ]),
        })
      );
    });
  });

  it("syncs bi-directionally when toggling bookmark or completing a lesson", async () => {
    (learningAPI.getOverallProgress as any).mockResolvedValueOnce({
      completedLessons: [],
      bookmarks: [],
    });
    (learningAPI.syncOverallProgress as any).mockResolvedValue({
      completedLessons: ["blockchain-foundations:blocks"],
      bookmarks: ["blockchain-foundations:blocks"],
    });

    render(<LearningDashboard />);

    await waitFor(() => {
      expect(learningAPI.getOverallProgress).toHaveBeenCalled();
    });

    const starButton = screen.getByText("☆ Star lesson");
    fireEvent.click(starButton);

    expect(screen.getByText("★ Starred")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(storageKeys.bookmarks)!)).toContain(
      "blockchain-foundations:blocks"
    );
    expect(learningAPI.syncOverallProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        bookmarks: ["blockchain-foundations:blocks"],
      })
    );

    const completeButton = screen.getByText("Mark Complete");
    fireEvent.click(completeButton);

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(storageKeys.completed)!)).toContain(
      "blockchain-foundations:blocks"
    );
    expect(learningAPI.syncOverallProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        completedLessons: ["blockchain-foundations:blocks"],
      })
    );
  });
});
