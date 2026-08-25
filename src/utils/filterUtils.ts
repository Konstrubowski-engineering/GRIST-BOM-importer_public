import type { BOMNode } from './bomParser';

/**
 * Checks if a node matches the search query across any of its properties/columns
 */
export function nodeMatchesQuery(node: BOMNode, query?: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;

  // Direct node properties
  if (node.item && String(node.item).toLowerCase().includes(q)) return true;
  if (node.partNumber && String(node.partNumber).toLowerCase().includes(q)) return true;
  if (node.description && String(node.description).toLowerCase().includes(q)) return true;
  if (node.bomStructure && String(node.bomStructure).toLowerCase().includes(q)) return true;
  if (node.qty !== undefined && node.qty !== null && String(node.qty).toLowerCase().includes(q)) return true;
  if (node.status && String(node.status).toLowerCase().includes(q)) return true;
  if (node.action && String(node.action).toLowerCase().includes(q)) return true;

  // Polish action descriptions
  let actionLabels = 'Bez zmian';
  if (node.status === 'Usunięty') actionLabels = 'Usuń (Soft) Usuń';
  else if (node.action === 'create') actionLabels = 'Utwórz Nowy';
  else if (node.action === 'update') actionLabels = 'Aktualizuj';
  if (actionLabels.toLowerCase().includes(q)) return true;

  // Raw data properties (e.g. Stock Number, REV, Material, Appearance, Mass, Vendor, Producent, etc.)
  if (node.rawData && typeof node.rawData === 'object') {
    for (const key of Object.keys(node.rawData)) {
      const val = node.rawData[key];
      if (val !== null && val !== undefined && String(val).toLowerCase().includes(q)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if any child/descendant of a node matches the search query
 */
export function hasMatchingDescendant(node: BOMNode, query?: string): boolean {
  if (!query) return false;
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (!node.children || node.children.length === 0) return false;
  return node.children.some(child => nodeMatchesQuery(child, q) || hasMatchingDescendant(child, q));
}

/**
 * Checks if a node should be visible in the tree view (either matches itself or has matching descendant)
 */
export function isNodeVisible(node: BOMNode, query?: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return nodeMatchesQuery(node, q) || hasMatchingDescendant(node, q);
}
