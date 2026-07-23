import type { BOMNode } from './bomParser';

// Helper to check if grist is available
function hasGrist(): boolean {
  return typeof grist !== 'undefined' && grist !== null;
}

export interface GristBOMCADRecord {
  id: number;
  Part_Number: string;
  Description: string;
  Stock_Number: string;
  REV: string;
  Material: string;
  Appearance: string;
  Mass: string;
  Vendor: string;
  Producent: string;
  BOM_Structure?: string;
  Projekt: number;
  [key: string]: any;
}

export interface GristBOMStrukturaRecord {
  id: number;
  Part_Number: number; // reference to BOM_CAD id
  Parent: number | null; // reference to BOM_CAD id
  Item: string;
  QTY: number | string;
  Status_czesci: string;
  Stock_Number: string;
  REV: string;
  Material: string;
  Appearance: string;
  Mass: string;
  Vendor: string;
  Description: string;
  BOM_Structure?: string;
  [key: string]: any;
}

// Current Projekt ID from the active record
export let currentProjektId: number | null = null;

// Network error types
export class GristNetworkError extends Error {
  constructor(message: string, public readonly originalError: any) {
    super(message);
    this.name = 'GristNetworkError';
  }
}

export class GristPermissionError extends Error {
  constructor(message: string = 'Brak uprawnień do wykonania tej operacji.') {
    super(message);
    this.name = 'GristPermissionError';
  }
}

export class GristTimeoutError extends Error {
  constructor(message: string = 'Połączenie z Grist wygasło.') {
    super(message);
    this.name = 'GristTimeoutError';
  }
}

// Retry configuration for network requests
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Execute a Grist API call with retry logic and timeout
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  retries: number = MAX_RETRIES
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (retries <= 0) {
      throw new GristNetworkError(
        `Nie udało się wykonać operacji "${operationName}" po ${MAX_RETRIES} próbach.`,
        error
      );
    }

    // Check for specific error types
    if (error.name === 'GristPermissionError') {
      throw error; // Don't retry permission errors
    }

    if (error.message?.includes('timeout') || error.name === 'TimeoutError') {
      throw new GristTimeoutError(error.message);
    }

    // Check for network errors
    if (error.message?.includes('network') || error.message?.includes('fetch')) {
      console.warn(`[GRIST-BOM] Network error in ${operationName}, retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return withRetry(operation, operationName, retries - 1);
    }

    // For other errors, try once more
    if (retries > 0) {
      console.warn(`[GRIST-BOM] Error in ${operationName}, retrying... (${retries} attempts left):`, error);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return withRetry(operation, operationName, retries - 1);
    }

    throw new GristNetworkError(`Wystąpił błąd podczas operacji "${operationName}".`, error);
  }
}

/**
 * Check if error is due to missing permissions
 */
function isPermissionError(error: any): boolean {
  const errorMessage = String(error).toLowerCase();
  return errorMessage.includes('permission') || 
         errorMessage.includes('access') || 
         errorMessage.includes('denied') ||
         errorMessage.includes('unauthorized');
}

export async function initGristApi(onRecordChange: (record: any) => void) {
  await new Promise<void>((resolve) => {
    if (typeof grist === 'undefined') {
      console.warn('[GRIST-BOM] Grist API not found. Running in standalone mode.');
      setTimeout(resolve, 1000);
      return;
    }

    console.warn('[GRIST-BOM] Initializing Grist API... (grist.ready already called in App.vue)');
    // grist.ready() is already called in App.vue before fetchProjects()
    // No need to call it again here

    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve(); } };

    // Case 1: Widget is linked via Select By to a table and receives a full record
    // (e.g. Source Data = Projekty, Selected By = Projekty)
    grist.onRecord((record: any) => {
      if (record && record.id) {
        // If the source table has a 'Projekt' reference column, use that
        // Otherwise treat the record itself as the project record
        currentProjektId = record.Projekt ?? record.id;
      }
      onRecordChange(record);
      done();
    });

    // Case 2: Widget is a view of BOM_struktura filtered by Projekt
    // When no rows exist for this projekt, onRecord is never called.
    // Grist passes filter state via linked widget options.
    grist.on('message', (event: any) => {
      if (event?.type === 'options') {
        const opts = event.options;
        if (opts?.filters?.Projekt && opts.filters.Projekt.length > 0) {
          currentProjektId = opts.filters.Projekt[0];
          onRecordChange(null);
          done();
        }
      }
    });

    // Also try to read from widget options directly (Grist 1.1.x+)
    if (typeof grist.widgetApi !== 'undefined') {
      grist.widgetApi.getOptions().then((opts: any) => {
        if (opts?.filters?.Projekt && opts.filters.Projekt.length > 0 && !currentProjektId) {
          currentProjektId = opts.filters.Projekt[0];
          onRecordChange(null);
          done();
        }
      }).catch(() => {});
    }

    // Fallback: if we still get no record after 3s, just resolve (user picks from dropdown)
    setTimeout(done, 3000);
  });
}

export async function fetchGristData() {
  if (typeof grist === 'undefined' || !grist.docApi) {
    console.warn('[GRIST-BOM] fetchGristData: Grist API not available');
    return { cad: [], struct: [] };
  }

  try {
    // Use retry logic for fetching tables
    const [cadTable, structTable] = await Promise.all([
      withRetry(
        () => grist.docApi.fetchTable('BOM_CAD'),
        'fetchTable(BOM_CAD)'
      ),
      withRetry(
        () => grist.docApi.fetchTable('BOM_struktura'),
        'fetchTable(BOM_struktura)'
      )
    ]);
    
    console.warn('[GRIST-BOM] Successfully fetched BOM_CAD and BOM_struktura');
    return {
      cad: formatGristTable<GristBOMCADRecord>(cadTable),
      struct: formatGristTable<GristBOMStrukturaRecord>(structTable)
    };
  } catch (e: any) {
    console.error('[GRIST-BOM] ERROR: Failed to fetch Grist data:', e);
    
    // Check if it's a permission error
    if (isPermissionError(e)) {
      throw new GristPermissionError('Brak uprawnień do odczytu tabel BOM_CAD lub BOM_struktura. Upewnij się, że widget ma uprawnienia "Full Access".');
    }
    
    // Check if it's a network error
    if (e instanceof GristNetworkError || e instanceof GristTimeoutError) {
      throw e;
    }
    
    // Try to fetch tables individually to identify which one fails
    try {
      const cadTable = await withRetry(
        () => grist.docApi.fetchTable('BOM_CAD'),
        'fetchTable(BOM_CAD)',
        1
      );
      console.warn('[GRIST-BOM] BOM_CAD fetched successfully');
      try {
        const structTable = await withRetry(
          () => grist.docApi.fetchTable('BOM_struktura'),
          'fetchTable(BOM_struktura)',
          1
        );
        console.warn('[GRIST-BOM] BOM_struktura fetched successfully');
        return {
          cad: formatGristTable<GristBOMCADRecord>(cadTable),
          struct: formatGristTable<GristBOMStrukturaRecord>(structTable)
        };
      } catch (structErr: any) {
        console.error('[GRIST-BOM] ERROR: Failed to fetch BOM_struktura:', structErr);
        if (isPermissionError(structErr)) {
          throw new GristPermissionError('Brak uprawnień do odczytu tabeli BOM_struktura.');
        }
        return {
          cad: formatGristTable<GristBOMCADRecord>(cadTable),
          struct: []
        };
      }
    } catch (cadErr: any) {
      console.error('[GRIST-BOM] ERROR: Failed to fetch BOM_CAD:', cadErr);
      if (isPermissionError(cadErr)) {
        throw new GristPermissionError('Brak uprawnień do odczytu tabeli BOM_CAD.');
      }
      return { cad: [], struct: [] };
    }
  }
}

function formatGristTable<T>(gristTableData: any): T[] {
  const records: any[] = [];
  const ids = gristTableData.id || [];
  for (let i = 0; i < ids.length; i++) {
    const record: any = { id: ids[i] };
    for (const key of Object.keys(gristTableData)) {
      if (key !== 'id') {
        record[key] = gristTableData[key][i];
      }
    }
    records.push(record);
  }
  return records;
}

export async function fetchProjects() {
  if (!hasGrist()) {
    console.warn('[GRIST-BOM] grist is undefined - widget not in Grist environment');
    return [];
  }
  
  if (!grist.docApi) {
    console.warn('[GRIST-BOM] grist.docApi not available');
    return [];
  }
  
  console.warn('[GRIST-BOM] grist.docApi is available');
  console.warn('[GRIST-BOM] grist.docApi.tables:', typeof grist.docApi.tables);
  
  try {
    let tableData: any = null;

    // Try 1: List all available tables and find the one with tableId = 'Projekty'
    if (grist.docApi.tables) {
      console.warn('[GRIST-BOM] grist.docApi.tables is available');
      const tableNames = Object.keys(grist.docApi.tables);
      console.warn('[GRIST-BOM] Available table names:', tableNames);
      
      for (const [tableName, tableObj] of Object.entries(grist.docApi.tables)) {
        const tableObjTyped = tableObj as { tableId: string };
        // Check if this table has tableId = 'Projekty'
        if (tableObjTyped.tableId === 'Projekty' || tableName === 'Projekty') {
          console.warn(`[GRIST-BOM] Found Projekty table with name: ${tableName}, tableId: ${tableObjTyped.tableId}`);
          tableData = await grist.docApi.fetchTable(tableName);
          if (tableData && tableData.id && tableData.id.length > 0) {
            console.warn('[GRIST-BOM] Successfully fetched Projekty table');
            return formatGristTable<any>(tableData);
          }
        }
      }
    }
    
    console.warn('[GRIST-BOM] Try 1 completed, moving to Try 2');

    // Try 2: First test if fetchTable works at all with a known table
    console.warn('[GRIST-BOM] Testing fetchTable with BOM_CAD (known to work)...');
    try {
      const testPromise = grist.docApi.fetchTable('BOM_CAD');
      const testTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('BOM_CAD fetch timeout')), 3000)
      );
      const testData = await Promise.race([testPromise, testTimeout]);
      console.warn('[GRIST-BOM] BOM_CAD fetch OK, data length:', testData?.id?.length || 0);
    } catch (e) {
      console.warn('[GRIST-BOM] BOM_CAD fetch failed:', e);
      console.warn('[GRIST-BOM] fetchTable is not working at all - permissions issue?');
    }
    
    // Try 2: Standard table name
    console.warn('[GRIST-BOM] Trying fetchTable("Projekty")...');
    console.warn('[GRIST-BOM] fetchTable type:', typeof grist.docApi.fetchTable);
    try {
      const fetchPromise = grist.docApi.fetchTable('Projekty');
      console.warn('[GRIST-BOM] fetchTable("Projekty") called, waiting for result...');
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('fetchTable timeout after 5s')), 5000)
      );
      tableData = await Promise.race([fetchPromise, timeoutPromise]);
      console.warn('[GRIST-BOM] fetchTable("Projekty") returned:', tableData ? 'data' : 'empty');
      if (tableData && tableData.id && tableData.id.length > 0) {
        console.warn('[GRIST-BOM] Found Projekty table with standard name');
        return formatGristTable<any>(tableData);
      }
    } catch (e) {
      console.warn('[GRIST-BOM] fetchTable("Projekty") failed:', e);
    }

    // Try 3: Numeric table ID (24 from database)
    try {
      
      tableData = await grist.docApi.fetchTable('24');
      if (tableData && tableData.id && tableData.id.length > 0) {
        console.warn('[GRIST-BOM] Found Projekty table with numeric ID 24 (as string)');
        return formatGristTable<any>(tableData);
      }
    } catch (e) {
      console.warn('[GRIST-BOM] fetchTable("24") failed:', e);
    }

    // Try 4: Table24 (Grist internal naming)
    try {
      
      tableData = await grist.docApi.fetchTable('Table24');
      if (tableData && tableData.id && tableData.id.length > 0) {
        console.warn('[GRIST-BOM] Found Projekty table as Table24');
        return formatGristTable<any>(tableData);
      }
    } catch (e) {
      console.warn('[GRIST-BOM] fetchTable("Table24") failed:', e);
    }

    // Try 5: Use selected table if widget is linked to Projekty
    try {
      
      tableData = await grist.docApi.fetchSelectedTable();
      if (tableData && tableData.id && tableData.id.length > 0) {
        console.warn('[GRIST-BOM] Using fetchSelectedTable()');
        return formatGristTable<any>(tableData);
      }
    } catch (e) {
      console.warn('[GRIST-BOM] fetchSelectedTable() failed:', e);
    }

    // Try 6: Iterate through all tables and check for 'Projekt' column
    console.warn('[GRIST-BOM] Trying to find table with Projekt column...');
    
    
    if (grist.docApi.tables) {
      
      
      for (const [tableName] of Object.entries(grist.docApi.tables)) {
        try {
          
          tableData = await grist.docApi.fetchTable(tableName);
          // Check if this table has a 'Projekt' or 'Projekty' column
          if (tableData && tableData.Projekt && Array.isArray(tableData.Projekt) && tableData.Projekt.length > 0) {
            console.warn(`[GRIST-BOM] Found table with Projekt column: ${tableName}`);
            return formatGristTable<any>(tableData);
          }
          if (tableData && tableData.Projekty && Array.isArray(tableData.Projekty) && tableData.Projekty.length > 0) {
            console.warn(`[GRIST-BOM] Found table with Projekty column: ${tableName}`);
            return formatGristTable<any>(tableData);
          }
        } catch (e) {
          // Skip errors for individual tables
        }
      }
    }

    console.warn('[GRIST-BOM] All attempts failed - Projekty table not found');
    return [];
  } catch (e) {
    console.error('[GRIST-BOM] ERROR: Nie udało się pobrać tabeli Projekty', e);
    return [];
  }
}

export async function syncToGrist(
  nodes: BOMNode[],
  projektId: number | null
) {
  if (typeof grist === 'undefined' || !grist.docApi) {
    throw new Error("Not connected to Grist!");
  }

  if (!projektId) {
    throw new Error("Wybierz projekt przed synchronizacją!");
  }

  const flatNodes = flattenNodes(nodes);
  const selectedNodes = flatNodes.filter(n => n.selected);

  console.warn('[GRIST-BOM] Total selected nodes:', selectedNodes.length);
  selectedNodes.forEach(n => {
    console.warn('[GRIST-BOM] Node:', n.partNumber, 'action:', n.action, 'status:', n.status, 'gristId:', n.gristId);
  });

  // ========================================================================
  // STEP 1: Fetch current BOM_CAD data (global library)
  // ========================================================================
  const cadData = await fetchGristData();
  const allCadRecords = cadData.cad;

  const cadMapGlobal = new Map<string, number>();
  for (const cad of allCadRecords) {
    if (cad.Part_Number) {
      cadMapGlobal.set(cad.Part_Number.toString().trim().toUpperCase(), cad.id);
    }
  }

  // ========================================================================
  // STEP 2: Create missing parts in BOM_CAD (global library)
  // ========================================================================
  // Nodes without gristId don't exist in BOM_CAD.
  // IMPORTANT: Deduplicate by Part_Number — the same part can appear multiple times
  // in the XLSX tree (same PN under different parent assemblies), producing multiple
  // BOMNode objects. Without dedup, each would trigger a separate BOM_CAD insert
  // creating duplicates.
  const _seenPNsForCad = new Set<string>();
  const partsToCreateInCad = selectedNodes.filter(n => {
    if (n.status === 'Usunięty' || n.action !== 'create' || n.gristId !== undefined) {
      return false;
    }
    const normalized = n.partNumber.toString().trim().toUpperCase();
    if (_seenPNsForCad.has(normalized)) {
      console.warn('[GRIST-BOM] Skipping duplicate BOM_CAD insert for PN (already queued):', n.partNumber);
      return false;
    }
    _seenPNsForCad.add(normalized);
    return true;
  });

  console.warn('[GRIST-BOM] Parts to create in BOM_CAD:', partsToCreateInCad.length);

  if (partsToCreateInCad.length > 0) {
    interface CadInsert {
      Part_Number: string;
      Description: string;
      Stock_Number: string;
      Material: string;
      REV: string;
      Appearance: string;
      Mass: string;
      Vendor: string;
      Producent: string;
      BOM_Structure: string;
    }

    const cadInserts: CadInsert[] = partsToCreateInCad.map(node => ({
      Part_Number: node.partNumber,
      Description: node.description,
      Stock_Number: node.rawData['Stock_Number'] || node.rawData['Stock Number'] || '',
      Material: node.rawData['Material'] || '',
      REV: node.rawData['REV'] || node.rawData['Revision'] || '',
      Appearance: node.rawData['Appearance'] || '',
      Mass: node.rawData['Mass'] || '',
      Vendor: node.rawData['Vendor'] || '',
      Producent: node.rawData['Producent'] || node.rawData['Manufacturer'] || '',
      BOM_Structure: node.bomStructure || node.rawData['BOM_Structure'] || node.rawData['BOM Structure'] || ''
    }));

    const cols = Object.keys(cadInserts[0]) as (keyof CadInsert)[];
    const payload: Record<string, any[]> = {};
    for (const col of cols) {
      payload[col] = cadInserts.map(r => r[col]);
    }
    const ids = new Array(cadInserts.length).fill(null);

    try {
      await withRetry(
        () => grist.docApi.applyUserActions([
          ['BulkAddRecord', 'BOM_CAD', ids, payload]
        ]),
        'BulkAddRecord(BOM_CAD)'
      );
      console.warn('[GRIST-BOM] Created', cadInserts.length, 'BOM_CAD records');
    } catch (e: any) {
      if (isPermissionError(e)) {
        throw new GristPermissionError('Brak uprawnień do dodawania rekordów do tabeli BOM_CAD.');
      }
      throw new GristNetworkError('Nie udało się dodać nowych części do BOM_CAD.', e);
    }

    // Refetch to get IDs of newly created records
    const updatedCadData = await fetchGristData();

    // Update cadMapGlobal with new records
    for (const cad of updatedCadData.cad) {
      if (cad.Part_Number && !cadMapGlobal.has(cad.Part_Number.toString().trim().toUpperCase())) {
        cadMapGlobal.set(cad.Part_Number.toString().trim().toUpperCase(), cad.id);
      }
    }
  }

  // ========================================================================
  // STEP 3: Create/Update BOM_struktura records
  // ========================================================================
  const structInserts: any[] = [];
  const structUpdates: any[] = [];

  for (const node of selectedNodes) {
    // Normalize part number for lookup
    const normalizedPartNumber = node.partNumber.toString().trim().toUpperCase();
    const cadId = cadMapGlobal.get(normalizedPartNumber);
    if (!cadId) {
      console.warn('[GRIST-BOM] WARNING: No CAD ID for:', node.partNumber);
      continue;
    }

    // Find parent CAD ID
    let parentId = null;
    if (node.parentItem) {
      const parentNode = flatNodes.find(n => n.item === node.parentItem);
      if (parentNode) {
        const normalizedParentPN = parentNode.partNumber.toString().trim().toUpperCase();
        parentId = cadMapGlobal.get(normalizedParentPN) || null;
      }
    }

    if (node.gristStructureId) {
      // Update existing structure: QTY, Parent, Status_czesci + new columns
      structUpdates.push([
        node.gristStructureId,
        {
          QTY: node.qty,
          Parent: parentId,
          Status_czesci: node.status,
          Stock_Number: node.rawData['Stock_Number'] || node.rawData['Stock Number'] || '',
          REV: node.rawData['REV'] || node.rawData['Revision'] || '',
          Material: node.rawData['Material'] || '',
          Appearance: node.rawData['Appearance'] || '',
          Mass: node.rawData['Mass'] || '',
          Vendor: node.rawData['Vendor'] || '',
          Description: node.description,
          BOM_Structure: node.bomStructure || node.rawData['BOM_Structure'] || node.rawData['BOM Structure'] || ''
        }
      ]);
    } else if (node.status !== 'Usunięty') {
      // Create new structure record with Projekt + new columns
      structInserts.push({
        Part_Number: cadId,
        Parent: parentId,
        Item: node.item,
        QTY: node.qty,
        Status_czesci: 'Aktywny',
        Projekt: projektId,
        Stock_Number: node.rawData['Stock_Number'] || node.rawData['Stock Number'] || '',
        REV: node.rawData['REV'] || node.rawData['Revision'] || '',
        Material: node.rawData['Material'] || '',
        Appearance: node.rawData['Appearance'] || '',
        Mass: node.rawData['Mass'] || '',
        Vendor: node.rawData['Vendor'] || '',
        Description: node.description,
        BOM_Structure: node.bomStructure || node.rawData['BOM_Structure'] || node.rawData['BOM Structure'] || ''
      });
    }
  }

  console.warn('[GRIST-BOM] Struct inserts:', structInserts.length, 'Updates:', structUpdates.length);

  const actions: any[] = [];

  if (structInserts.length > 0) {
    const cols = Object.keys(structInserts[0]);
    const payload: any = {};
    for (const col of cols) {
      payload[col] = structInserts.map(r => r[col]);
    }
    actions.push(['BulkAddRecord', 'BOM_struktura', new Array(structInserts.length).fill(null), payload]);
  }

  if (structUpdates.length > 0) {
    const ids = structUpdates.map(u => u[0]);
    const columns = Object.keys(structUpdates[0][1]);
    const updatesByCol: any = {};
    for (const col of columns) {
      updatesByCol[col] = structUpdates.map(u => u[1][col]);
    }
    actions.push(['BulkUpdateRecord', 'BOM_struktura', ids, updatesByCol]);
  }

  if (actions.length > 0) {
    try {
      await withRetry(
        () => grist.docApi.applyUserActions(actions),
        'applyUserActions(BOM_struktura)'
      );
      console.warn('[GRIST-BOM] Executed struct actions');
    } catch (e: any) {
      if (isPermissionError(e)) {
        throw new GristPermissionError('Brak uprawnień do modyfikacji tabeli BOM_struktura.');
      }
      throw new GristNetworkError('Nie udało się zaktualizować struktury BOM.', e);
    }
  }
}

/**
 * Flatten tree of BOMNode into a single array
 */
export function flattenNodes(nodes: BOMNode[]): BOMNode[] {
  const flat: BOMNode[] = [];
  for (const node of nodes) {
    flat.push(node);
    if (node.children.length > 0) {
      flat.push(...flattenNodes(node.children));
    }
  }
  return flat;
}
