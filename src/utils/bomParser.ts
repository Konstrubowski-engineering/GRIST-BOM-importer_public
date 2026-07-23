import * as XLSX from 'xlsx';

export interface BOMRow {
  Item: string;
  PartNumber: string;
  QTY: number | string;
  Description: string;
  Stock_Number: string;
  REV: string;
  Material: string;
  Appearance: string;
  Mass: string;
  Vendor: string;
  Producent: string;
  BOM_Structure?: string;
  [key: string]: any;
}

export interface BOMNode {
  item: string;
  partNumber: string;
  qty: number | string;
  description: string;
  bomStructure: string;
  rawData: BOMRow;
  children: BOMNode[];
  parentItem: string | null;
  // UI state
  selected: boolean;
  expanded: boolean;
  action: 'create' | 'update' | 'none' | 'delete';
  status: string; // e.g. "Aktywny", "Usunięty"
  gristId?: number; // matched BOM_CAD id
  gristStructureId?: number; // matched BOM_struktura id
}

// Required columns for BOM file validation
const REQUIRED_COLUMNS = ['Item', 'Part Number', 'Description'];

// Maximum allowed file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Maximum number of rows to process
const MAX_ROWS = 10000;

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  row?: number;
  column?: string;
}

/**
 * Validate BOM file structure and content
 */
export function validateBOMData(rows: BOMRow[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if file is empty
  if (rows.length === 0) {
    errors.push('Plik XLSX jest pusty lub nie zawiera poprawnych danych.');
    return { isValid: false, errors, warnings };
  }

  // Check if file has too many rows
  if (rows.length > MAX_ROWS) {
    warnings.push(`Plik zawiera ${rows.length} wierszy. Zalecana maksymalna liczba to ${MAX_ROWS}.`);
  }

  // Check required columns
  const availableColumns = Object.keys(rows[0]);
  const missingColumns = REQUIRED_COLUMNS.filter(col => 
    !availableColumns.some(availCol => availCol.toLowerCase().trim() === col.toLowerCase())
  );

  if (missingColumns.length > 0) {
    errors.push(`Brakujące wymagane kolumny: ${missingColumns.join(', ')}`);
  }

  // Check for duplicate Part Numbers
  const partNumbers = rows.map(r => r.PartNumber.toString().trim().toUpperCase());
  const duplicatePartNumbers = partNumbers.filter((pn, index) => 
    partNumbers.indexOf(pn) !== index
  );

  if (duplicatePartNumbers.length > 0) {
    warnings.push(`Znaleziono ${duplicatePartNumbers.length} zduplikowanych numerów części: ${[...new Set(duplicatePartNumbers)].slice(0, 5).join(', ')}...`);
  }

  // Check for empty Part Numbers
  const emptyPartNumbers = rows.filter(r => !r.PartNumber.toString().trim());
  if (emptyPartNumbers.length > 0) {
    errors.push(`Znaleziono ${emptyPartNumbers.length} wierszy z pustym numerem części (Part Number).`);
  }

  // Check for empty Items
  const emptyItems = rows.filter(r => !r.Item.toString().trim());
  if (emptyItems.length > 0) {
    errors.push(`Znaleziono ${emptyItems.length} wierszy z pustym numerem pozycji (Item).`);
  }

  // Check QTY values
  const invalidQTY = rows.filter(r => {
    const qty = r.QTY;
    if (typeof qty === 'number') return false;
    if (typeof qty === 'string') {
      const num = parseFloat(qty);
      return isNaN(num) || num < 0;
    }
    return true;
  });

  if (invalidQTY.length > 0) {
    warnings.push(`Znaleziono ${invalidQTY.length} wierszy z nieprawidłową ilością (QTY). Użyto domyślnej wartości 1.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate file before parsing
 */
export function validateFile(file: File): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check file type
  const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];
  if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx?|csv)$/i)) {
    errors.push('Nieprawidłowy typ pliku. Dozwolone: .xlsx, .xls, .csv');
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    errors.push(`Plik jest za duży (${(file.size / 1024 / 1024).toFixed(2)} MB). Maksymalny rozmiar: ${MAX_FILE_SIZE / 1024 / 1024} MB.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

export async function parseBOMFile(file: File): Promise<{ nodes: BOMNode[]; validation: ValidationResult }> {
  // First, validate the file itself
  const fileValidation = validateFile(file);
  if (!fileValidation.isValid) {
    return { nodes: [], validation: fileValidation };
  }

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Parse with header row
  const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  
  // Standardize keys (remove trailing spaces, case-insensitive matching)
  const rows: BOMRow[] = json.map((row, index) => {
    const standardizedRow: any = {};
    for (const key in row) {
      standardizedRow[key.trim()] = row[key];
    }
    
    // Extract required fields with case-insensitive matching
    const getField = (fieldName: string): string => {
      const field = Object.keys(standardizedRow).find(k => 
        k.toLowerCase().trim() === fieldName.toLowerCase()
      );
      return field ? String(standardizedRow[field] || '') : '';
    };

    // Extract QTY with fallback to 1
    let qty: number | string = 1;
    const qtyField = Object.keys(standardizedRow).find(k => 
      ['QTY', 'Quantity', 'Unit QTY', 'Ilość'].some(alias => 
        k.toLowerCase().trim() === alias.toLowerCase()
      )
    );
    if (qtyField && standardizedRow[qtyField] !== '') {
      const qtyValue = standardizedRow[qtyField];
      if (typeof qtyValue === 'number') {
        qty = qtyValue;
      } else if (typeof qtyValue === 'string') {
        const num = parseFloat(qtyValue);
        qty = isNaN(num) ? 1 : num;
      }
    }

    const bomStructure = getField('BOM Structure') || getField('BOM_Structure') || getField('BOMStructure');

    return {
      Item: getField('Item'),
      PartNumber: getField('Part Number'),
      QTY: qty,
      Description: getField('Description'),
      Stock_Number: getField('Stock Number'),
      REV: getField('REV'),
      Material: getField('Material'),
      Appearance: getField('Appearance'),
      Mass: getField('Mass'),
      Vendor: getField('Vendor'),
      Producent: getField('Producent') || getField('Manufacturer'),
      BOM_Structure: bomStructure,
      ...standardizedRow
    };
  }).filter(r => r.Item && r.PartNumber); // Skip empty rows

  // Validate parsed data
  const validation = validateBOMData(rows);

  // If there are errors, return empty nodes
  if (!validation.isValid) {
    return { nodes: [], validation };
  }

  // Build tree from valid rows
  const nodes = buildTree(rows);

  return { nodes, validation };
}

function buildTree(rows: BOMRow[]): BOMNode[] {
  const rootNodes: BOMNode[] = [];
  const nodeMap = new Map<string, BOMNode>();
  
  // Sort rows by Item just to ensure parents come before children if possible
  // In BOMs, items usually are sorted 1, 1.1, 1.1.1. 
  // We'll process them in the given order but look up parents by substring.
  
  for (const row of rows) {
    const itemStr = row.Item.trim();
    const node: BOMNode = {
      item: itemStr,
      partNumber: row.PartNumber.trim(),
      qty: row.QTY,
      description: row.Description.trim(),
      bomStructure: (row.BOM_Structure || '').trim(),
      rawData: row,
      children: [],
      parentItem: null,
      selected: true,
      expanded: true,
      action: 'none',
      status: 'Aktywny'
    };
    
    nodeMap.set(itemStr, node);
  }
  
  for (const node of nodeMap.values()) {
    // Find parent. If Item is "1.1.2", parent is "1.1"
    const parts = node.item.split('.');
    if (parts.length > 1) {
      parts.pop();
      const parentItemStr = parts.join('.');
      node.parentItem = parentItemStr;
      
      const parentNode = nodeMap.get(parentItemStr);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        // Parent not found in map, treat as root
        rootNodes.push(node);
      }
    } else {
      // Top level item (e.g. "1", "2")
      node.parentItem = null;
      rootNodes.push(node);
    }
  }
  
  return rootNodes;
}
