import { nanoid } from 'nanoid';

export interface Snippet {
  id: string;
  title: string;
  content: string;
  language: string;
  tags: string[];
  isPublic: boolean;
  authorId: string;
  createdAt: number;
  updatedAt: number;
  versionCount: number;
}

export interface SearchFilters {
  query?: string;
  tags?: string[];
  language?: string;
  isPublic?: boolean;
}

const STORAGE_KEY = 'web3_student_lab_snippets';

export class SnippetManager {
  private static instance: SnippetManager;
  private snippets: Snippet[] = [];

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): SnippetManager {
    if (!SnippetManager.instance) {
      SnippetManager.instance = new SnippetManager();
    }
    return SnippetManager.instance;
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        this.snippets = JSON.parse(stored);
      } catch (e) {
        console.error('Failed to load snippets from storage', e);
        this.snippets = [];
      }
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snippets));
  }

  public getSnippets(filters?: SearchFilters): Snippet[] {
    let result = [...this.snippets];

    if (filters) {
      if (filters.query) {
        const q = filters.query.toLowerCase();
        result = result.filter(s => 
          s.title.toLowerCase().includes(q) || 
          s.content.toLowerCase().includes(q)
        );
      }
      if (filters.tags && filters.tags.length > 0) {
        result = result.filter(s => 
          filters.tags!.every(t => s.tags.includes(t))
        );
      }
      if (filters.language) {
        result = result.filter(s => s.language === filters.language);
      }
      if (filters.isPublic !== undefined) {
        result = result.filter(s => s.isPublic === filters.isPublic);
      }
    }

    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public getSnippetById(id: string): Snippet | undefined {
    return this.snippets.find(s => s.id === id);
  }

  public saveSnippet(snippetData: Partial<Snippet>): Snippet {
    const now = Date.now();
    let snippet: Snippet;

    if (snippetData.id) {
      const index = this.snippets.findIndex(s => s.id === snippetData.id);
      if (index !== -1) {
        snippet = {
          ...this.snippets[index],
          ...snippetData,
          updatedAt: now,
        };
        this.snippets[index] = snippet;
      } else {
        // Fallback to create if id not found
        snippet = {
          id: snippetData.id || nanoid(),
          title: snippetData.title || 'Untitled Snippet',
          content: snippetData.content || '',
          language: snippetData.language || 'typescript',
          tags: snippetData.tags || [],
          isPublic: snippetData.isPublic || false,
          authorId: snippetData.authorId || 'current-user',
          createdAt: snippetData.createdAt || now,
          updatedAt: now,
          versionCount: snippetData.versionCount || 1,
        };
        this.snippets.push(snippet);
      }
    } else {
      snippet = {
        id: nanoid(),
        title: snippetData.title || 'Untitled Snippet',
        content: snippetData.content || '',
        language: snippetData.language || 'typescript',
        tags: snippetData.tags || [],
        isPublic: snippetData.isPublic || false,
        authorId: snippetData.authorId || 'current-user',
        createdAt: now,
        updatedAt: now,
        versionCount: 1,
      };
      this.snippets.push(snippet);
    }

    this.saveToStorage();
    return snippet;
  }

  public deleteSnippet(id: string) {
    this.snippets = this.snippets.filter(s => s.id !== id);
    this.saveToStorage();
  }

  public toggleVisibility(id: string): Snippet | undefined {
    const snippet = this.getSnippetById(id);
    if (snippet) {
      snippet.isPublic = !snippet.isPublic;
      snippet.updatedAt = Date.now();
      this.saveToStorage();
      return snippet;
    }
    return undefined;
  }

  public getAllTags(): string[] {
    const tags = new Set<string>();
    this.snippets.forEach(s => s.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }
}
