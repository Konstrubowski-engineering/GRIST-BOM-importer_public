import type { BOMNode } from './bomParser';
import { nodeMatchesQuery } from './filterUtils';

/**
 * Find all nodes matching the query across any field.
 * Searches a flat list of nodes (typically the visible flat nodes).
 */
export function findAllMatches(nodes: BOMNode[], query: string): BOMNode[] {
  const q = query.trim();
  if (!q) return [];
  return nodes.filter(n => nodeMatchesQuery(n, q));
}

/**
 * Build the ancestor path from root to the given node using parentRef.
 * Returns an array of ancestors (excluding the node itself), or null if
 * the chain cannot be resolved (e.g. parentRef not set).
 */
export function getAncestorPath(node: BOMNode): BOMNode[] | null {
  const path: BOMNode[] = [];
  let current = node.parentRef;
  while (current) {
    path.unshift(current);
    current = current.parentRef;
  }
  return path;
}

/**
 * Expand all ancestors of a node so it becomes visible in the tree.
 */
export function expandAncestors(node: BOMNode): void {
  const ancestors = getAncestorPath(node);
  if (!ancestors) return;
  for (const ancestor of ancestors) {
    ancestor.expanded = true;
  }
}

/**
 * Scroll the DOM row for the given node key into view.
 * The key must match the data-node-key attribute set on .node-row in TreeNode.vue.
 */
export function scrollNodeIntoView(nodeKey: string): void {
  const el = document.querySelector(`[data-node-key="${cssEscape(nodeKey)}"]`);
  if (el) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(s);
  }
  return s.replace(/["\\]/g, '\\$&');
}
