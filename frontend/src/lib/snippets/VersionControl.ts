import { nanoid } from 'nanoid';

export interface SnippetVersion {
  id: string;
  snippetId: string;
  content: string;
  message: string;
  timestamp: number;
}

const VERSIONS_STORAGE_KEY = 'web3_student_lab_versions';

export class VersionControl {
  private static instance: VersionControl;
  private versions: Record<string, SnippetVersion[]> = {};

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): VersionControl {
    if (!VersionControl.instance) {
      VersionControl.instance = new VersionControl();
    }
    return VersionControl.instance;
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(VERSIONS_STORAGE_KEY);
    if (stored) {
      try {
        this.versions = JSON.parse(stored);
      } catch (e) {
        console.error('Failed to load versions from storage', e);
        this.versions = {};
      }
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    localStorage.setItem(VERSIONS_STORAGE_KEY, JSON.stringify(this.versions));
  }

  public createVersion(snippetId: string, content: string, message: string = 'Update'): SnippetVersion {
    const version: SnippetVersion = {
      id: nanoid(),
      snippetId,
      content,
      message,
      timestamp: Date.now(),
    };

    if (!this.versions[snippetId]) {
      this.versions[snippetId] = [];
    }

    this.versions[snippetId].push(version);
    this.saveToStorage();
    return version;
  }

  public getHistory(snippetId: string): SnippetVersion[] {
    return (this.versions[snippetId] || []).sort((a, b) => b.timestamp - a.timestamp);
  }

  public getVersionById(snippetId: string, versionId: string): SnippetVersion | undefined {
    return this.versions[snippetId]?.find(v => v.id === versionId);
  }

  public deleteHistory(snippetId: string) {
    delete this.versions[snippetId];
    this.saveToStorage();
  }

  // Simple line-based diff logic
  public getDiff(oldContent: string, newContent: string) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    // This is a very basic diff for display purposes
    // In a real app, you'd use a library or Monaco's DiffEditor
    return {
      oldLines,
      newLines,
    };
  }
}
