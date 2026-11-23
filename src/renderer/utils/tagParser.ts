import { type TagData } from '../api';
/**
 * Parse #tags from HTML content.
 * Supports nested tags like #parent/child.
 * Extracts from <span class="hashtag"> elements and bare #tag text.
 * Ignores tags inside code/pre blocks.
 */
export function parseTags(content: string): string[] {
  const tags = new Set<string>();
  const tagRegex = /#([\p{L}\p{N}_][\p{L}\p{N}_/]*)/gu;

  // Extract from hashtag spans
  const spanRegex = /<span class="hashtag">#([\p{L}\p{N}_][\p{L}\p{N}_/]*)<\/span>/gu;
  let match;
  while ((match = spanRegex.exec(content)) !== null) {
    tags.add(match[1]);
  }

  // Also extract bare #tags from plain text (strip code/pre blocks and HTML tags)
  const cleaned = content
    .replace(/<code[\s>][\s\S]*?<\/code>/gi, '')
    .replace(/<pre[\s>][\s\S]*?<\/pre>/gi, '')
    .replace(/<[^>]*>/g, ' ');

  while ((match = tagRegex.exec(cleaned)) !== null) {
    tags.add(match[1]);
  }

  return Array.from(tags);
}

/**
 * Build a tree structure from flat tag names.
 * e.g. ["work", "work/project", "personal"] =>
 * [{ name: "work", children: [{ name: "project", children: [] }] }, { name: "personal", children: [] }]
 */
export interface TagTreeNode {
  id: string;
  name: string;
  fullName: string;
  noteCount: number;
  isPinned: boolean;
  sortOrder: number;
  children: TagTreeNode[];
}

// Sibling ordering: pinned first, then manual sortOrder, then name as a stable fallback.
function sortSiblings(nodes: TagTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.fullName.localeCompare(b.fullName);
  });
  for (const n of nodes) {
    if (n.children.length > 0) sortSiblings(n.children);
  }
}

export function buildTagTree(tags: TagData[]): TagTreeNode[] {
  const roots: TagTreeNode[] = [];
  const nodeMap = new Map<string, TagTreeNode>();

  for (const tag of tags) {
    const parts = tag.name.split('/');
    const node: TagTreeNode = {
      id: tag.id,
      name: parts[parts.length - 1],
      fullName: tag.name,
      noteCount: tag.noteCount,
      isPinned: tag.isPinned,
      sortOrder: tag.sortOrder,
      children: [],
    };
    nodeMap.set(tag.id, node);
  }

  for (const tag of tags) {
    const node = nodeMap.get(tag.id);
    if (!node) continue;
    const parent = tag.parentId ? nodeMap.get(tag.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sortSiblings(roots);
  return roots;
}
