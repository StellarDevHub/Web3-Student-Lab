"use client";

import { GitConflictResolutionTutorial } from '@/components/version-control/GitConflictResolutionTutorial';
import { useState, useCallback, useMemo, useEffect } from "react";
import {
  VersionControl,
  type DocumentEntry,
  type Version,
  type VerifiedIdentityMetadata,
} from "@/lib/version-control/engine";
import { VersionHistory } from "@/components/version-control/VersionHistory";
import {
  IdentityVerificationStore,
  createIdentityAttestation,
  verifyIdentityAttestation,
  type DecentralizedIdentityProfile,
  type IdentityVerificationAttestation,
  type IdentityVerificationResult,
} from "@/lib/open-source-trainer/identity";
import {
  Plus,
  FileText,
  Trash2,
  Clock,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  BadgeCheck,
  LoaderCircle,
} from "lucide-react";
import { formatDistanceToNow } from "@/lib/utils";

const DEFAULT_IDENTITY_PROFILE: DecentralizedIdentityProfile = {
  did: "did:key:web3studentlab-contributor",
  walletAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  githubHandle: "web3-student",
  contributorTier: "newcomer",
  skills: ["documentation", "testing", "code review"],
};

function toVerifiedIdentityMetadata(
  attestation: IdentityVerificationAttestation,
): VerifiedIdentityMetadata {
  return {
    did: attestation.subject.did,
    walletAddress: attestation.subject.walletAddress,
    githubHandle: attestation.subject.githubHandle,
    verifiedAt: attestation.issuedAt,
    issuer: attestation.issuer,
    method: attestation.method,
  };
}

export default function VersionControlPage() {
  const [documents, setDocuments] = useState<DocumentEntry[]>(() =>
    VersionControl.getAllDocuments(),
  );
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [author, setAuthor] = useState("Current User");
  const [identityProfile, setIdentityProfile] =
    useState<DecentralizedIdentityProfile>(DEFAULT_IDENTITY_PROFILE);
  const [identityAttestation, setIdentityAttestation] =
    useState<IdentityVerificationAttestation | null>(null);
  const [identityResult, setIdentityResult] =
    useState<IdentityVerificationResult | null>(null);
  const [isVerifyingIdentity, setIsVerifyingIdentity] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const activeDoc = useMemo(
    () => (activeDocId ? documents.find((d) => d.id === activeDocId) : null),
    [activeDocId, documents],
  );

  const latestVersion = useMemo(
    () => (activeDoc ? VersionControl.getLatestVersion(activeDoc.id) : null),
    [activeDoc],
  );

  const refreshDocuments = useCallback(() => {
    setDocuments(VersionControl.getAllDocuments());
  }, []);

  useEffect(() => {
    const storedAttestation = IdentityVerificationStore.load();
    if (!storedAttestation) return;

    setIdentityAttestation(storedAttestation);
    setIdentityProfile(storedAttestation.subject);

    void verifyIdentityAttestation(storedAttestation).then((result) => {
      setIdentityResult(result);
      if (!result.isValid) {
        IdentityVerificationStore.clear();
        setIdentityAttestation(null);
      }
    });
  }, []);

  const handleCreate = useCallback(() => {
    if (!newTitle.trim() || !newContent.trim()) return;
    VersionControl.createDocument(
      newTitle.trim(),
      newContent.trim(),
      author,
      "Initial version",
    );
    setNewTitle("");
    setNewContent("");
    setShowCreate(false);
    refreshDocuments();
  }, [newTitle, newContent, author, refreshDocuments]);

  const handleVerifyIdentity = useCallback(async () => {
    setIsVerifyingIdentity(true);
    setIdentityError(null);

    try {
      const attestation = await createIdentityAttestation(identityProfile);
      const result = await verifyIdentityAttestation(attestation);

      setIdentityAttestation(attestation);
      setIdentityResult(result);

      if (!result.isValid) {
        IdentityVerificationStore.clear();
        throw new Error(result.reason);
      }

      IdentityVerificationStore.save(attestation);
    } catch (error) {
      setIdentityError(
        error instanceof Error ? error.message : "Failed to verify identity.",
      );
    } finally {
      setIsVerifyingIdentity(false);
    }
  }, [identityProfile]);

  const handleClearIdentity = useCallback(() => {
    IdentityVerificationStore.clear();
    setIdentityAttestation(null);
    setIdentityResult(null);
    setIdentityError(null);
  }, []);

  const handleSaveVersion = useCallback(() => {
    if (
      !activeDocId ||
      !editContent.trim() ||
      !identityAttestation ||
      !identityResult?.isValid
    )
      return;

    VersionControl.createVersion(
      activeDocId,
      editTitle.trim() || activeDoc?.title || "Untitled",
      editContent,
      author,
      commitMessage.trim() || "Updated content",
      ["did-verified", identityProfile.contributorTier],
      {
        verifiedIdentity: toVerifiedIdentityMetadata(identityAttestation),
      },
    );

    setCommitMessage("");
    refreshDocuments();
  }, [
    activeDocId,
    editContent,
    identityAttestation,
    identityResult,
    editTitle,
    activeDoc,
    author,
    commitMessage,
    identityProfile.contributorTier,
    refreshDocuments,
  ]);

  const handleRollback = useCallback(
    (version: Version) => {
      if (!activeDocId) return;
      VersionControl.rollback(activeDocId, version.id, author);
      refreshDocuments();
    },
    [activeDocId, author, refreshDocuments],
  );

  const handleDelete = useCallback(
    (docId: string) => {
      VersionControl.deleteDocument(docId);
      if (activeDocId === docId) {
        setActiveDocId(null);
        setShowHistory(false);
      }
      refreshDocuments();
    },
    [activeDocId, refreshDocuments],
  );

  const openDocument = useCallback((doc: DocumentEntry) => {
    const latest = VersionControl.getLatestVersion(doc.id);
    if (latest) {
      setEditTitle(latest.title);
      setEditContent(latest.content);
    }
    setActiveDocId(doc.id);
    setShowHistory(false);
  }, []);

  const isIdentityVerified = Boolean(
    identityAttestation && identityResult?.isValid,
  );
  const latestVersionIdentity = latestVersion?.metadata.verifiedIdentity;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 lg:px-8">
      <div className="mb-10 grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div>
          <span className="eyebrow">Open source contribution trainer</span>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-5xl">
            Decentralized Identity Verification
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-8 text-[var(--muted)]">
            Verify contributor identity before submitting issue fixes, branch
            updates, and pull-request training artifacts. Every saved version
            carries a DID-backed verification record so the trainer can model
            production-ready contribution workflows.
          </p>
        </div>

        <div className="surface-card rounded-2xl border border-white/8 bg-white/4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                Verification status
              </p>
              <div className="mt-2 flex items-center gap-2 text-[var(--text-strong)]">
                {isIdentityVerified ? (
                  <>
                    <ShieldCheck className="h-5 w-5 text-emerald-400" />
                    <span className="font-medium">Identity verified</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-5 w-5 text-amber-400" />
                    <span className="font-medium">Verification required</span>
                  </>
                )}
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {identityResult?.reason ||
                  "Link a contributor DID, Stellar wallet, and GitHub handle before saving a new trainer version."}
              </p>
            </div>
            {isIdentityVerified && (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                MVP ready
              </span>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-[var(--muted)]">
              DID
              <input
                type="text"
                value={identityProfile.did}
                onChange={(e) =>
                  setIdentityProfile((current) => ({
                    ...current,
                    did: e.target.value,
                  }))
                }
                className="mt-1.5 w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-[var(--text-strong)] outline-none focus:border-white/15"
              />
            </label>
            <label className="text-sm text-[var(--muted)]">
              Stellar wallet
              <input
                type="text"
                value={identityProfile.walletAddress}
                onChange={(e) =>
                  setIdentityProfile((current) => ({
                    ...current,
                    walletAddress: e.target.value,
                  }))
                }
                className="mt-1.5 w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-[var(--text-strong)] outline-none focus:border-white/15"
              />
            </label>
            <label className="text-sm text-[var(--muted)]">
              GitHub handle
              <input
                type="text"
                value={identityProfile.githubHandle}
                onChange={(e) =>
                  setIdentityProfile((current) => ({
                    ...current,
                    githubHandle: e.target.value,
                  }))
                }
                className="mt-1.5 w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-[var(--text-strong)] outline-none focus:border-white/15"
              />
            </label>
            <label className="text-sm text-[var(--muted)]">
              Contributor tier
              <select
                value={identityProfile.contributorTier}
                onChange={(e) =>
                  setIdentityProfile((current) => ({
                    ...current,
                    contributorTier: e.target
                      .value as DecentralizedIdentityProfile["contributorTier"],
                  }))
                }
                className="mt-1.5 w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-[var(--text-strong)] outline-none focus:border-white/15"
              >
                <option value="newcomer">Newcomer</option>
                <option value="reviewer">Reviewer</option>
                <option value="maintainer">Maintainer</option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            {identityProfile.skills.map((skill) => (
              <span
                key={skill}
                className="rounded-full border border-white/8 bg-white/4 px-2.5 py-1"
              >
                {skill}
              </span>
            ))}
          </div>

          {identityAttestation && (
            <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-4 text-xs text-[var(--muted)]">
              <p>
                <span className="font-semibold text-[var(--text-strong)]">
                  Issuer:
                </span>{" "}
                {identityAttestation.issuer}
              </p>
              <p className="mt-1 break-all">
                <span className="font-semibold text-[var(--text-strong)]">
                  Challenge:
                </span>{" "}
                {identityAttestation.challenge}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-[var(--text-strong)]">
                  Expires:
                </span>{" "}
                {new Date(identityAttestation.expiresAt).toLocaleString()}
              </p>
            </div>
          )}

          {identityError && (
            <p className="mt-4 text-sm text-rose-300">{identityError}</p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => void handleVerifyIdentity()}
              disabled={isVerifyingIdentity}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-strong)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {isVerifyingIdentity ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <BadgeCheck className="h-4 w-4" />
              )}
              Verify identity
            </button>
            <button
              onClick={handleClearIdentity}
              className="rounded-xl border border-white/8 bg-white/4 px-4 py-2.5 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--text-strong)]"
            >
              Clear proof
            </button>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <GitConflictResolutionTutorial />
      </div>

      <div className="grid gap-8 xl:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">
              Contribution drafts
            </h2>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2 text-xs font-medium text-[var(--text-strong)] transition-colors hover:bg-white/10"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          </div>

          {showCreate && (
            <div className="surface-card rounded-2xl border border-white/8 bg-white/4 p-4">
              <h3 className="mb-3 text-sm font-semibold text-[var(--text-strong)]">
                New Contribution Draft
              </h3>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Issue title or PR summary"
                className="mb-2 w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--muted)] focus:border-white/15"
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Describe the proposed fix, testing notes, and review context..."
                rows={4}
                className="mb-3 w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--muted)] focus:border-white/15 resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newTitle.trim() || !newContent.trim()}
                  className="rounded-xl bg-[var(--brand-strong)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="rounded-xl border border-white/8 bg-white/4 px-4 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--text-strong)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {documents.length === 0 && (
            <div className="rounded-2xl border border-white/8 bg-white/4 p-6 text-center">
              <FileText className="mx-auto mb-2 h-6 w-6 text-[var(--muted)]" />
              <p className="text-sm text-[var(--muted)]">
                No contribution drafts yet
              </p>
            </div>
          )}

          <div className="space-y-2">
            {documents.map((doc) => {
              const docLatestVersion = VersionControl.getLatestVersion(doc.id);
              const hasVerifiedIdentity =
                VersionControl.hasVerifiedIdentity(docLatestVersion);

              return (
                <button
                  key={doc.id}
                  onClick={() => openDocument(doc)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                    activeDocId === doc.id
                      ? "border-[var(--brand-strong)]/40 bg-[var(--brand-strong)]/10"
                      : "border-white/8 bg-white/4 hover:border-white/15"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-strong)]">
                        {doc.title}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        v{doc.currentVersion} &middot;{" "}
                        {formatDistanceToNow(doc.updatedAt)}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
                        <span
                          className={`rounded-full px-2 py-1 ${
                            hasVerifiedIdentity
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-amber-500/10 text-amber-300"
                          }`}
                        >
                          {hasVerifiedIdentity
                            ? "DID verified"
                            : "pending proof"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(doc.id);
                      }}
                      className="shrink-0 rounded-lg border border-white/8 bg-white/4 p-1.5 text-[var(--muted)] transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {activeDoc ? (
            <>
              <div className="surface-card rounded-2xl border border-white/8 bg-white/4 p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="border-none bg-transparent text-xl font-semibold text-[var(--text-strong)] outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowHistory(!showHistory)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--text-strong)]"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      History
                    </button>
                  </div>
                </div>

                <div className="mb-4 rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    {latestVersionIdentity ? (
                      <>
                        <ShieldCheck className="h-4 w-4 text-emerald-400" />
                        <p className="text-sm text-[var(--text-strong)]">
                          Latest saved version verified for{" "}
                          <span className="font-medium">
                            {latestVersionIdentity.githubHandle}
                          </span>
                        </p>
                        <span className="rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-xs text-[var(--muted)]">
                          {latestVersionIdentity.did}
                        </span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="h-4 w-4 text-amber-400" />
                        <p className="text-sm text-[var(--muted)]">
                          No verified DID has been attached to the latest saved
                          version yet.
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={15}
                  className="w-full resize-none rounded-xl border border-white/8 bg-black/20 px-4 py-3 font-mono text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--muted)] focus:border-white/15"
                />

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Describe your changes..."
                    className="min-w-[220px] flex-1 rounded-xl border border-white/8 bg-black/20 px-4 py-2.5 text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--muted)] focus:border-white/15"
                  />
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-36 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--muted)] focus:border-white/15"
                  />
                  <button
                    onClick={handleSaveVersion}
                    disabled={
                      !editContent.trim() ||
                      !commitMessage.trim() ||
                      !isIdentityVerified
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand-strong)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Save verified version
                  </button>
                </div>
              </div>

              {showHistory && (
                <VersionHistory
                  documentId={activeDoc.id}
                  onRollback={handleRollback}
                  onClose={() => setShowHistory(false)}
                />
              )}
            </>
          ) : (
            <div className="surface-card flex flex-col items-center justify-center rounded-2xl border border-white/8 bg-white/4 p-12 text-center">
              <FileText className="mb-4 h-10 w-10 text-[var(--muted)]" />
              <h2 className="text-xl font-semibold text-[var(--text-strong)]">
                Select a contribution draft
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Choose a draft from the list or create a new one to start
                rehearsing issue fixes and pull-request updates.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
