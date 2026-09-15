import type { BOMNode } from './bomParser';
import { markInseparableChildren, markReferenceNodes } from './bomParser';
import { flattenNodes, type GristBOMCADRecord, type GristBOMStrukturaRecord } from './gristApi';

/**
 * Calculate diff between XLSX nodes and existing Grist data
 * 
 * LOGIC:
 * - BOM_CAD is GLOBAL library (not filtered by project)
 * - BOM_struktura is PROJECT-SPECIFIC structure
 * - Action is based on whether (PartNumber + Parent) exists in BOM_struktura for the selected project
 * 
 * Action meaning:
 * - 'create': PartNumber doesn't exist in BOM_CAD OR structure relationship doesn't exist in BOM_struktura
 * - 'update': Structure exists but QTY/Status changed
 * - 'none': Structure exists with same QTY/Status
 */
export function calculateDiff(
  nodes: BOMNode[], 
  cadRecords: GristBOMCADRecord[], 
  structRecords: GristBOMStrukturaRecord[],
  projektId: number | null
): BOMNode[] {
  
  // ========================================================================
  // BOM_CAD: Global library - use ALL records regardless of project
  // ========================================================================
  const cadMap = new Map<string, GristBOMCADRecord>();
  for (const cad of cadRecords) {
    if (cad.Part_Number) {
      // Normalize part number for case-insensitive comparison
      cadMap.set(cad.Part_Number.toString().trim().toUpperCase(), cad);
    }
  }
  
  // Map CAD ID to Part_Number for structure lookups
  const cadIdToPartNumber = new Map<number, string>();
  for (const cad of cadRecords) {
    cadIdToPartNumber.set(cad.id, cad.Part_Number.toString().trim().toUpperCase());
  }
  
  // ========================================================================
  // BOM_struktura: Filter by projektId - only structures for THIS project
  // ========================================================================
  const projectStructRecords = projektId !== null
    ? structRecords.filter(s => (s as any).Projekt === projektId || (s as any).Projekt === Number(projektId))
    : structRecords;
  
  console.warn('[GRIST-BOM] calculateDiff: projektId:', projektId);
  console.warn('[GRIST-BOM] calculateDiff: All CAD records:', cadRecords.length);
  console.warn('[GRIST-BOM] calculateDiff: Struct records for this project:', projectStructRecords.length);
  
  // ========================================================================
  // Build structure lookup maps for this project
  // 1. exactStructMap: key "${parentPartNumber}:::${childPartNumber}" -> GristBOMStrukturaRecord[]
  // 2. partStructMap:  key "${childPartNumber}" -> GristBOMStrukturaRecord[]
  // ========================================================================
  const exactStructMap = new Map<string, GristBOMStrukturaRecord[]>();
  const partStructMap = new Map<string, GristBOMStrukturaRecord[]>();
  
  for (const s of projectStructRecords) {
    const childPN = cadIdToPartNumber.get(s.Part_Number);
    if (!childPN) continue;
    
    const parentPN = s.Parent ? (cadIdToPartNumber.get(s.Parent) || 'root') : 'root';
    const exactKey = `${parentPN}:::${childPN}`;
    
    if (!exactStructMap.has(exactKey)) {
      exactStructMap.set(exactKey, []);
    }
    exactStructMap.get(exactKey)!.push(s);
    
    if (!partStructMap.has(childPN)) {
      partStructMap.set(childPN, []);
    }
    partStructMap.get(childPN)!.push(s);
  }
  
  // Track matched Grist structure IDs to prevent claiming the same Grist record multiple times
  const matchedStructIds = new Set<number>();
  
  // ========================================================================
  // Clear any phantom 'delete' nodes from previous diff runs
  // ========================================================================
  const flatNodes = flattenNodes(nodes);
  for (const node of flatNodes) {
    node.children = node.children.filter(c => c.action !== 'delete');
    node.gristId = undefined;
    node.gristStructureId = undefined;
  }
  
  // Phase 1: Exact matches (Parent Part Number + Child Part Number)
  for (const node of flatNodes) {
    const normalizedPartNumber = node.partNumber.toString().trim().toUpperCase();
    const cadRecord = cadMap.get(normalizedPartNumber);
    if (cadRecord) {
      node.gristId = cadRecord.id;
    }
    
    const parentNode = node.parentItem ? flatNodes.find(n => n.item === node.parentItem) : null;
    const parentPartNumber = parentNode ? parentNode.partNumber.toString().trim().toUpperCase() : 'root';
    
    const exactKey = `${parentPartNumber}:::${normalizedPartNumber}`;
    const candidates = exactStructMap.get(exactKey) || [];
    
    // Find first unmatched candidate (preferring exact Item string if multiple)
    let match: GristBOMStrukturaRecord | undefined;
    for (const cand of candidates) {
      if (!matchedStructIds.has(cand.id)) {
        if (cand.Item === node.item) {
          match = cand;
          break;
        } else if (!match) {
          match = cand;
        }
      }
    }
    
    if (match) {
      matchedStructIds.add(match.id);
      node.gristStructureId = match.id;
      
      const existingBomStruct = match.BOM_Structure || (cadRecord ? cadRecord.BOM_Structure : '') || '';
      const bomStructChanged = existingBomStruct !== node.bomStructure;
      const qtyChanged = Number(match.QTY) !== Number(node.qty);
      const statusChanged = match.Status_czesci === 'Usunięty';
      const itemChanged = match.Item !== node.item;
      
      if (qtyChanged || statusChanged || bomStructChanged || itemChanged) {
        node.action = 'update';
        node.status = 'Aktywny';
        console.warn('[GRIST-BOM] Exact match with changes:', node.partNumber, '→ action: update');
      } else {
        node.action = 'none';
        node.status = 'Aktywny';
        console.warn('[GRIST-BOM] Exact match unchanged:', node.partNumber, '→ action: none');
      }
    }
  }
  
  // Phase 2: Moved / Re-parented matches (Part Number exists in this project's structure under a different parent/item)
  for (const node of flatNodes) {
    if (node.gristStructureId !== undefined) continue;
    
    const normalizedPartNumber = node.partNumber.toString().trim().toUpperCase();
    const cadRecord = cadMap.get(normalizedPartNumber);
    if (cadRecord) {
      node.gristId = cadRecord.id;
    }
    
    const candidates = partStructMap.get(normalizedPartNumber) || [];
    const match = candidates.find(cand => !matchedStructIds.has(cand.id));
    
    if (match) {
      matchedStructIds.add(match.id);
      node.gristStructureId = match.id;
      node.action = 'update'; // Hierarchy or position changed
      node.status = 'Aktywny';
      console.warn('[GRIST-BOM] Re-parented match for:', node.partNumber, 'old struct id:', match.id, '→ action: update');
    }
  }
  
  // Phase 3: Brand new items (not in Grist structure for this project)
  for (const node of flatNodes) {
    if (node.gristStructureId === undefined) {
      const normalizedPartNumber = node.partNumber.toString().trim().toUpperCase();
      const cadRecord = cadMap.get(normalizedPartNumber);
      if (cadRecord) {
        node.gristId = cadRecord.id;
      }
      node.action = 'create';
      node.status = 'Aktywny';
      console.warn('[GRIST-BOM] New node in structure:', node.partNumber, '→ action: create');
    }
  }
  
  // ========================================================================
  // Phase 4: Soft Deletions (Items in Grist structure that are missing from XLSX)
  // ========================================================================
  for (const s of projectStructRecords) {
    if (!matchedStructIds.has(s.id) && s.Status_czesci !== 'Usunięty') {
      const childPN = cadIdToPartNumber.get(s.Part_Number) || 'Nieznana część';
      const cadRecord = cadRecords.find(c => c.id === s.Part_Number);
      
      const phantomNode: BOMNode = {
        item: s.Item || '?',
        partNumber: childPN,
        qty: s.QTY,
        description: (cadRecord ? cadRecord.Description : s.Description) || 'Usunięty (nie w XLSX)',
        bomStructure: s.BOM_Structure || (cadRecord ? cadRecord.BOM_Structure : '') || '',
        rawData: {} as any,
        children: [],
        parentItem: null,
        selected: false,
        expanded: true,
        action: 'delete',
        status: 'Usunięty',
        gristId: s.Part_Number,
        gristStructureId: s.id
      };
      
      let attached = false;
      if (s.Parent) {
        const parentPN = cadIdToPartNumber.get(s.Parent);
        if (parentPN) {
          const excelParent = flatNodes.find(n => n.partNumber.toString().trim().toUpperCase() === parentPN);
          if (excelParent) {
            phantomNode.parentItem = excelParent.item;
            excelParent.children.push(phantomNode);
            attached = true;
          }
        }
      }
      
      if (!attached) {
        nodes.push(phantomNode);
      }
      
      console.warn('[GRIST-BOM] Missing structure record marked for soft-delete:', childPN, 'struct id:', s.id);
    }
  }

  // Re-apply hidden flags after diff (Phase 4 may have added phantom nodes).
  markInseparableChildren(nodes, false);
  markReferenceNodes(nodes, false);

  return nodes;
}
