import type { BOMNode } from './bomParser';
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
  
  // Build structure map: parentPartNumber -> Map<childPartNumber, structRecord>
  // This represents the CURRENT structure in Grist for this project
  const structMap = new Map<string, Map<string, GristBOMStrukturaRecord>>();
  
  for (const s of projectStructRecords) {
    const parentId = s.Parent;
    const childId = s.Part_Number;
    
    const parentPartNumber = parentId ? cadIdToPartNumber.get(parentId) || 'root' : 'root';
    const childPartNumber = cadIdToPartNumber.get(childId);
    
    if (childPartNumber) {
      if (!structMap.has(parentPartNumber)) {
        structMap.set(parentPartNumber, new Map());
      }
      structMap.get(parentPartNumber)!.set(childPartNumber, s);
    }
  }
  
  // ========================================================================
  // Calculate actions for each node
  // ========================================================================
  const flatNodes = flattenNodes(nodes);
  
  for (const node of flatNodes) {
    // Normalize part number for lookup
    const normalizedPartNumber = node.partNumber.toString().trim().toUpperCase();
    const cadRecord = cadMap.get(normalizedPartNumber);
    
    // Determine parent part number for structure lookup
    const parentNode = node.parentItem ? flatNodes.find(n => n.item === node.parentItem) : null;
    const parentPartNumber = parentNode ? parentNode.partNumber.toString().trim().toUpperCase() : 'root';
    
    // Check if this node exists in BOM_CAD (global library)
    const partExistsInCad = cadRecord !== undefined;
    
    // Check if the STRUCTURE relationship (parent -> child) exists in BOM_struktura for this project
    const childrenMap = structMap.get(parentPartNumber);
    const structRecord = childrenMap?.get(normalizedPartNumber);
    const structureExists = structRecord !== undefined;
    
    if (!partExistsInCad) {
      // PartNumber doesn't exist in BOM_CAD at all
      node.action = 'create';
      node.status = 'Aktywny';
      console.warn('[GRIST-BOM] Node NOT in BOM_CAD:', node.partNumber, '→ action: create');
    } else {
      node.gristId = cadRecord.id;
      
      if (!structureExists) {
        // Part exists in BOM_CAD but the structure relationship doesn't exist for this project
        node.action = 'create';
        node.status = 'Aktywny';
        console.warn('[GRIST-BOM] Node in BOM_CAD but NOT in struktura for this project:', node.partNumber, 'parent:', parentPartNumber, '→ action: create');
      } else {
        // Both part and structure exist
        node.gristId = cadRecord.id;
        node.gristStructureId = structRecord.id;
        
        // Check if QTY, Status, or BOM_Structure changed
        const existingBomStruct = structRecord.BOM_Structure || cadRecord.BOM_Structure || '';
        const bomStructChanged = existingBomStruct !== node.bomStructure;
        
        if (structRecord.QTY != node.qty || structRecord.Status_czesci === 'Usunięty' || bomStructChanged) {
          node.action = 'update';
          node.status = 'Aktywny';
          console.warn('[GRIST-BOM] Node structure exists but QTY/Status/BOM_Structure changed:', node.partNumber, 'QTY:', structRecord.QTY, 'vs', node.qty, 'BOM_Struct:', existingBomStruct, 'vs', node.bomStructure, '→ action: update');
        } else {
          node.action = 'none';
          node.status = 'Aktywny';
          console.warn('[GRIST-BOM] Node structure exists with same QTY/BOM_Structure:', node.partNumber, '→ action: none');
        }
      }
    }
  }
  
  // ========================================================================
  // Handle Soft Deletions: Items in Grist but NOT in XLSX
  // ========================================================================
  // Clear any phantom 'delete' nodes from previous diff runs to prevent
  // them from accumulating on repeated refreshActions() calls (since
  // fileData and tree share the same object references).
  for (const node of flatNodes) {
    node.children = node.children.filter(c => c.action !== 'delete');
  }

  const allExcelParts = new Set(flatNodes.map(n => n.partNumber.toString().trim().toUpperCase()));
  
  for (const [parentPN, childrenMap] of structMap.entries()) {
    // Only handle soft deletions for parents that are in the Excel file
    if (parentPN !== 'root' && !allExcelParts.has(parentPN)) {
      continue;
    }
    
    for (const [childPN, structRecord] of childrenMap.entries()) {
      if (!allExcelParts.has(childPN) && structRecord.Status_czesci !== 'Usunięty') {
        // This item is in Grist structure but missing from Excel
        const cadRecord = cadRecords.find(c => c.id === structRecord.Part_Number);
        
        const phantomNode: BOMNode = {
          item: structRecord.Item || '?',
          partNumber: childPN,
          qty: structRecord.QTY,
          description: cadRecord ? cadRecord.Description : 'Usunięty (nie w XLSX)',
          bomStructure: structRecord.BOM_Structure || (cadRecord ? cadRecord.BOM_Structure : '') || '',
          rawData: {} as any,
          children: [],
          parentItem: null,
          selected: false,
          expanded: true,
          action: 'delete',
          status: 'Usunięty',
          gristId: structRecord.Part_Number,
          gristStructureId: structRecord.id
        };
        
        if (parentPN !== 'root') {
          const excelParent = flatNodes.find(n => n.partNumber.toString().trim().toUpperCase() === parentPN);
          if (excelParent) {
            phantomNode.parentItem = excelParent.item;
            excelParent.children.push(phantomNode);
          } else {
            nodes.push(phantomNode);
          }
        }
      }
    }
  }
  
  return nodes;
}
