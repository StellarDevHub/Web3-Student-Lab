'use client';

import { useState, useCallback, useMemo } from 'react';
import { VersionControl, type DocumentEntry, type Version } from '@/lib/version-control/engine';
import { VersionHistory } from '@/components/version-control/VersionHistory';
import { Plus, FileText, Trash2, Clock, RotateCcw } from 'lucide-react';
import { formatDistanceToNow } from '@/lib/utils';

export default function VersionControlPage() {
  const [documents, setDocuments] = useState<DocumentEntry[]>(() =>
    VersionControl.getAllDocuments()
  );
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [author, setAuthor] = useState('Current User');

  const activeDoc = useMemo(
    () => (activeDocId ? documents.find((d) => d.id === activeDocId) : null),
    [activeDocId, documents]
  );

  const refreshDocuments = useCallback(() => {
    setDocuments(VersionControl.getAllDocuments());
  }, []);

  const handleCreate = useCallback(() => {
    if (!newTitle.trim() || !newContent.trim()) return;
    VersionControl.createDocument(newTitle.trim(), newContent.trim(), author, 'Initial version');
    setNewTitle('');
    setNewContent('');
    setShowCreate(false);
    refreshDocuments();
  }, [newTitle, newContent, author, refreshDocuments]);

  const handleSaveVersion = useCallback(() => {
    if (!activeDocId || !editContent.trim()) return;
    VersionControl.createVersion(
      activeDocId,
      editTitle.trim() || activeDoc?.title || 'Untitled',
      editContent,
      author,
      commitMessage.trim() || 'Updated content'
    );
    setCommitMessage('');
    refreshDocuments();
  }, [activeDocId, editContent, editTitle, activeDoc, author, commitMessage, refreshDocuments]);

  const handleRollback = useCallback(
    (version: Version) => {
      if (!activeDocId) return;
      VersionControl.rollback(activeDocId, version.id, author);
      refreshDocuments();
    },
    [activeDocId, author, refreshDocuments]
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
    [activeDocId, refreshDocuments]
  );

  const openDocument = useCallback(
    (doc: DocumentEntry) => {
      const latest = VersionControl.getLatestVersion(doc.id);
      if (latest) {
        setEditTitle(latest.title);
        setEditContent(latest.content);
      }
      setActiveDocId(doc.id);
      setShowHistory(false);
    },
    []
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 lg:px-8">
      <div className="mb-10">
        <span className="eyebrow">Content management</span>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-5xl">
          Version Control
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-8 text-[var(--muted)]">
          Track changes to learning materials with full version history, comparison, and rollback
          capability.
        </p>
      </div>

      <div className="grid gap-8 xl:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-strong)]">Documents</h2>
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
                New Document
              </h3>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Document title"
                className="mb-2 w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--muted)] focus:border-white/15"
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Document content..."
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
              <p className="text-sm text-[var(--muted)]">No documents yet</p>
            </div>
          )}

          <div className="space-y-2">
            {documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => openDocument(doc)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  activeDocId === doc.id
                    ? 'border-[var(--brand-strong)]/40 bg-[var(--brand-strong)]/10'
                    : 'border-white/8 bg-white/4 hover:border-white/15'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-strong)] truncate">
                      {doc.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      v{doc.currentVersion} &middot; {formatDistanceToNow(doc.updatedAt)}
                    </p>
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
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {activeDoc ? (
            <>
              <div className="surface-card rounded-2xl border border-white/8 bg-white/4 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="text-xl font-semibold text-[var(--text-strong)] bg-transparent outline-none border-none"
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

                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={15}
                  className="w-full rounded-xl border border-white/8 bg-black/20 px-4 py-3 font-mono text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--muted)] focus:border-white/15 resize-none"
                />

                <div className="mt-4 flex items-center gap-3">
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Describe your changes..."
                    className="flex-1 rounded-xl border border-white/8 bg-black/20 px-4 py-2.5 text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--muted)] focus:border-white/15"
                  />
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-36 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--muted)] focus:border-white/15"
                  />
                  <button
                    onClick={handleSaveVersion}
                    disabled={!editContent.trim() || !commitMessage.trim()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand-strong)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Save version
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
                Select a document
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Choose a document from the list or create a new one to start versioning.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
