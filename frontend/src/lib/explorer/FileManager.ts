import { nanoid } from 'nanoid';

export type FileType = 'file' | 'folder';

export interface FileNode {
  id: string;
  name: string;
  type: FileType;
  parentId: string | null;
  children?: string[]; // IDs of child nodes
  content?: string;
  isOpen?: boolean;
}

export class FileManager {
  private nodes: Map<string, FileNode> = new Map();
  private rootId: string | null = null;

  constructor() {
    // Initialize with a root folder
    const root: FileNode = {
      id: nanoid(),
      name: 'Project',
      type: 'folder',
      parentId: null,
      children: [],
      isOpen: true,
    };
    this.nodes.set(root.id, root);
    this.rootId = root.id;
  }

  getRootId(): string | null {
    return this.rootId;
  }

  getNode(id: string): FileNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): FileNode[] {
    return Array.from(this.nodes.values());
  }

  createFile(parentId: string, name: string, content: string = ''): string {
    const parent = this.nodes.get(parentId);
    if (!parent || parent.type !== 'folder') throw new Error('Invalid parent');

    const id = nanoid();
    const newNode: FileNode = {
      id,
      name,
      type: 'file',
      parentId,
      content,
    };

    this.nodes.set(id, newNode);
    parent.children = [...(parent.children || []), id];
    return id;
  }

  createFolder(parentId: string, name: string): string {
    const parent = this.nodes.get(parentId);
    if (!parent || parent.type !== 'folder') throw new Error('Invalid parent');

    const id = nanoid();
    const newNode: FileNode = {
      id,
      name,
      type: 'folder',
      parentId,
      children: [],
      isOpen: false,
    };

    this.nodes.set(id, newNode);
    parent.children = [...(parent.children || []), id];
    return id;
  }

  moveNode(id: string, newParentId: string) {
    const node = this.nodes.get(id);
    const newParent = this.nodes.get(newParentId);

    if (!node || !newParent || newParent.type !== 'folder') return;
    if (node.parentId === newParentId) return;

    // Check for circular reference
    let curr: FileNode | undefined = newParent;
    while (curr) {
      if (curr.id === id) throw new Error('Cannot move folder into itself');
      curr = curr.parentId ? this.nodes.get(curr.parentId) : undefined;
    }

    // Remove from old parent
    if (node.parentId) {
      const oldParent = this.nodes.get(node.parentId);
      if (oldParent) {
        oldParent.children = oldParent.children?.filter((childId) => childId !== id);
      }
    }

    // Add to new parent
    node.parentId = newParentId;
    newParent.children = [...(newParent.children || []), id];
  }

  deleteNode(id: string) {
    const node = this.nodes.get(id);
    if (!node || node.id === this.rootId) return;

    // Remove from parent
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.children = parent.children?.filter((childId) => childId !== id);
      }
    }

    // Recursive delete
    if (node.type === 'folder' && node.children) {
      node.children.forEach((childId) => this.deleteNode(childId));
    }

    this.nodes.delete(id);
  }

  renameNode(id: string, newName: string) {
    const node = this.nodes.get(id);
    if (node) {
      node.name = newName;
    }
  }

  toggleFolder(id: string) {
    const node = this.nodes.get(id);
    if (node && node.type === 'folder') {
      node.isOpen = !node.isOpen;
    }
  }
}
