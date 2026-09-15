import type { BOMNode } from './bomParser';

export type SortColumn =
  | 'item' | 'partNumber' | 'bomStructure' | 'qty' | 'description'
  | 'stock' | 'rev' | 'material' | 'appearance' | 'mass' | 'vendor' | 'action';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: SortColumn | null;
  direction: SortDirection;
}

/**
 * Extract a comparable value from a node for the given column.
 * Returns a number for numeric columns (qty, mass) and a lowercase string otherwise.
 */
export function getSortValue(node: BOMNode, column: SortColumn): string | number {
  switch (column) {
    case 'partNumber':
      return String(node.partNumber || '').toLowerCase();
    case 'bomStructure':
      return String(node.bomStructure || '').toLowerCase();
    case 'qty': {
      const n = Number(node.qty);
      return isNaN(n) ? 0 : n;
    }
    case 'description':
      return String(node.description || '').toLowerCase();
    case 'stock':
      return String(node.rawData?.Stock_Number || node.rawData?.['Stock Number'] || '').toLowerCase();
    case 'rev':
      return String(node.rawData?.REV || node.rawData?.Revision || '').toLowerCase();
    case 'material':
      return String(node.rawData?.Material || '').toLowerCase();
    case 'appearance':
      return String(node.rawData?.Appearance || '').toLowerCase();
    case 'mass': {
      const m = Number(node.rawData?.Mass);
      return isNaN(m) ? 0 : m;
    }
    case 'vendor':
      return String(node.rawData?.Vendor || '').toLowerCase();
    case 'action':
      return String(node.action || '').toLowerCase();
    default:
      return '';
  }
}

/**
 * Compare two item strings using natural numeric ordering of dot-separated
 * components, so that "1.2" sorts before "1.10".
 */
export function compareItemStrings(a: string, b: string): number {
  const pa = String(a).split('.');
  const pb = String(b).split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = parseInt(pa[i], 10);
    const nb = parseInt(pb[i], 10);
    const aOk = !isNaN(na);
    const bOk = !isNaN(nb);
    if (aOk && bOk) {
      if (na !== nb) return na - nb;
    } else if (aOk) {
      return -1;
    } else if (bOk) {
      return 1;
    } else {
      const sa = (pa[i] || '').toLowerCase();
      const sb = (pb[i] || '').toLowerCase();
      if (sa !== sb) return sa < sb ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Compare two BOMNodes by the given column and direction.
 * Uses natural numeric ordering for the 'item' column.
 * Falls back to item order as a stable tiebreaker.
 */
export function compareNodes(a: BOMNode, b: BOMNode, column: SortColumn, dir: SortDirection): number {
  let cmp: number;
  if (column === 'item') {
    cmp = compareItemStrings(a.item, b.item);
  } else {
    const va = getSortValue(a, column);
    const vb = getSortValue(b, column);
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb;
    } else {
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      cmp = sa < sb ? -1 : (sa > sb ? 1 : 0);
    }
  }
  if (cmp === 0) {
    cmp = compareItemStrings(a.item, b.item);
  }
  return dir === 'desc' ? -cmp : cmp;
}

/**
 * Return a new sorted array of nodes (does not mutate the input).
 * Returns the original array reference when sort state is inactive.
 */
export function sortNodeArray(nodes: BOMNode[], state: SortState): BOMNode[] {
  if (!state.column) return nodes;
  return [...nodes].sort((a, b) => compareNodes(a, b, state.column as SortColumn, state.direction));
}
