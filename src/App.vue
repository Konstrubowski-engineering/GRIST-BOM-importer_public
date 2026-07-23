<template>
  <div class="app-container">
    <header class="header">
      <h1>🔩 BOM Importer</h1>
      <div class="project-info">
        <label class="project-label">Projekt:</label>
        <select v-model="projektId" class="project-select" :disabled="isSyncing">
          <option :value="null">— wybierz projekt —</option>
          <option v-for="p in availableProjects" :key="p.id" :value="p.id">
            {{ p.Projekt || p.id }}
          </option>
        </select>
        <span v-if="autoDetectedProjektId" class="auto-badge">
          ✓ Auto-wykryty ID: {{ autoDetectedProjektId }}
        </span>
        <span v-if="!projektId" class="warn-badge">
          ⚠ Wybierz projekt
        </span>
      </div>
    </header>

    <main class="content">
      <!-- Upload Zone -->
      <div v-if="!tree.length && !validationErrors.length" class="upload-zone" @dragover.prevent @drop.prevent="handleDrop">
        <input type="file" ref="fileInput" @change="handleFileSelect" accept=".xlsx, .csv" class="hidden-input" />
        <div class="upload-content" @click="fileInput?.click()">
          <div class="icon">📁</div>
          <h2>Upuść plik XLSX / CSV tutaj</h2>
          <p>lub kliknij, aby wybrać z dysku</p>
        </div>
      </div>

      <!-- Validation Errors Display -->
      <div v-if="validationErrors.length > 0" class="validation-errors">
        <div class="error-header">
          <span class="error-icon">❌</span>
          <h3>Błędy walidacji pliku</h3>
          <button @click="reset" class="btn btn-secondary">Wróć</button>
        </div>
        <ul class="error-list">
          <li v-for="(error, index) in validationErrors" :key="index" class="error-item">
            {{ error }}
          </li>
        </ul>
        <div v-if="validationWarnings.length > 0" class="warnings-section">
          <h4>⚠️ Ostrzeżenia:</h4>
          <ul class="warning-list">
            <li v-for="(warning, index) in validationWarnings" :key="index" class="warning-item">
              {{ warning }}
            </li>
          </ul>
        </div>
      </div>

      <!-- Tree View -->
      <div v-else-if="tree.length" class="tree-container">
        <div class="toolbar">
          <button @click="reset" class="btn btn-secondary" :disabled="isSyncing">Anuluj</button>
          <button @click="refreshActions" class="btn btn-secondary" :disabled="!fileData.length || isSyncing">
            Odśwież akcje
          </button>
          <button @click="showConfirmSync = true" class="btn btn-primary" :disabled="isSyncing || !projektId">
            {{ isSyncing ? 'Synchronizowanie...' : 'Synchronizuj zaznaczone z Grist' }}
          </button>
        </div>
        
        <div class="tree-table-wrapper">
          <div class="tree-header">
            <div class="col-expand"><div class="resize-handle" @mousedown="startResize('col-expand', $event)"></div></div>
            <div class="col-check">✔<div class="resize-handle" @mousedown="startResize('col-check', $event)"></div></div>
            <div class="col-item">Item<div class="resize-handle" @mousedown="startResize('col-item', $event)"></div></div>
            <div class="col-part">Part Number<div class="resize-handle" @mousedown="startResize('col-part', $event)"></div></div>
            <div class="col-bom-struct">BOM Structure<div class="resize-handle" @mousedown="startResize('col-bom-struct', $event)"></div></div>
            <div class="col-qty">QTY<div class="resize-handle" @mousedown="startResize('col-qty', $event)"></div></div>
            <div class="col-desc">Description<div class="resize-handle" @mousedown="startResize('col-desc', $event)"></div></div>
            <div class="col-stock">Stock Number<div class="resize-handle" @mousedown="startResize('col-stock', $event)"></div></div>
            <div class="col-rev">REV<div class="resize-handle" @mousedown="startResize('col-rev', $event)"></div></div>
            <div class="col-material">Material<div class="resize-handle" @mousedown="startResize('col-material', $event)"></div></div>
            <div class="col-appearance">Appearance<div class="resize-handle" @mousedown="startResize('col-appearance', $event)"></div></div>
            <div class="col-mass">Mass<div class="resize-handle" @mousedown="startResize('col-mass', $event)"></div></div>
            <div class="col-vendor">Vendor<div class="resize-handle" @mousedown="startResize('col-vendor', $event)"></div></div>
            <div class="col-action">Akcja<div class="resize-handle" @mousedown="startResize('col-action', $event)"></div></div>
          </div>

          <div class="tree-body">
            <TreeNode v-for="node in tree" :key="node.item + node.partNumber" :node="node" :columnWidths="columnWidths" />
          </div>
        </div>
      </div>
    </main>

    <!-- Confirmation Modal -->
    <div v-if="showConfirmSync" class="modal-overlay" @click.self="showConfirmSync = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Potwierdź synchronizację</h3>
          <button @click="showConfirmSync = false" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <p>Czy na pewno chcesz zsynchronizować zaznaczone elementy z Grist?</p>
          <div class="sync-summary">
            <p><strong>Podsumowanie:</strong></p>
            <ul>
              <li>Liczba zaznaczonych elementów: <strong>{{ selectedCount }}</strong></li>
              <li>Liczba nowych części (do dodania): <strong>{{ createCount }}</strong></li>
              <li>Liczba aktualizacji: <strong>{{ updateCount }}</strong></li>
              <li>Liczba usunięć: <strong>{{ deleteCount }}</strong></li>
            </ul>
          </div>
          <div v-if="!projektId" class="error-message">
            ⚠️ Musisz wybrać projekt przed synchronizacją!
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showConfirmSync = false" class="btn btn-secondary" :disabled="isSyncing">Anuluj</button>
          <button @click="confirmSync" class="btn btn-primary" :disabled="isSyncing || !projektId">
            {{ isSyncing ? 'Synchronizowanie...' : 'Potwierdź' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Error Modal -->
    <div v-if="showErrorModal" class="modal-overlay" @click.self="showErrorModal = false">
      <div class="modal error-modal">
        <div class="modal-header">
          <h3>❌ Błąd</h3>
          <button @click="showErrorModal = false" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <p>{{ errorMessage }}</p>
          <div v-if="errorDetails" class="error-details">
            <h4>Szczegóły:</h4>
            <pre>{{ errorDetails }}</pre>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showErrorModal = false" class="btn btn-primary">OK</button>
        </div>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>Przetwarzanie pliku...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import TreeNode from './components/TreeNode.vue';
import { parseBOMFile, type BOMNode } from './utils/bomParser';
import { 
  initGristApi, 
  fetchGristData, 
  syncToGrist, 
  fetchProjects, 
  currentProjektId,
  GristNetworkError,
  GristPermissionError,
  GristTimeoutError
} from './utils/gristApi';
import { calculateDiff } from './utils/diffLogic';

// State
const tree = ref<BOMNode[]>([]);
const projektId = ref<number | null>(null);
const autoDetectedProjektId = ref<number | null>(null);
const availableProjects = ref<any[]>([]);
const isSyncing = ref(false);
const isLoading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const fileData = ref<BOMNode[]>([]); // Store parsed file data for refresh
const validationErrors = ref<string[]>([]);
const validationWarnings = ref<string[]>([]);

// Column widths state
const columnWidths = ref<Record<string, number>>({
  'col-expand': 40,
  'col-check': 40,
  'col-item': 120,
  'col-part': 180,
  'col-bom-struct': 130,
  'col-qty': 80,
  'col-desc': 250,
  'col-stock': 150,
  'col-rev': 80,
  'col-material': 150,
  'col-appearance': 150,
  'col-mass': 100,
  'col-vendor': 150,
  'col-action': 130
});

// Modal state
const showConfirmSync = ref(false);
const showErrorModal = ref(false);
const errorMessage = ref('');
const errorDetails = ref('');

// Sync summary computed properties
const selectedCount = computed(() => {
  const flatNodes = flattenNodes(tree.value);
  return flatNodes.filter(n => n.selected).length;
});

const createCount = computed(() => {
  const flatNodes = flattenNodes(tree.value);
  return flatNodes.filter(n => n.selected && n.action === 'create').length;
});

const updateCount = computed(() => {
  const flatNodes = flattenNodes(tree.value);
  return flatNodes.filter(n => n.selected && n.action === 'update').length;
});

const deleteCount = computed(() => {
  const flatNodes = flattenNodes(tree.value);
  return flatNodes.filter(n => n.selected && n.action === 'delete').length;
});

// Helper function to flatten nodes (moved from gristApi.ts for reuse)
function flattenNodes(nodes: BOMNode[]): BOMNode[] {
  const flat: BOMNode[] = [];
  for (const node of nodes) {
    flat.push(node);
    if (node.children.length > 0) {
      flat.push(...flattenNodes(node.children));
    }
  }
  return flat;
}

// Resize state
const resizeData = ref<{
  column: string;
  startX: number;
  startWidth: number;
} | null>(null);

// Column resize functions
const startResize = (column: string, e: MouseEvent) => {
  resizeData.value = {
    column,
    startX: e.clientX,
    startWidth: columnWidths.value[column]
  };
  e.preventDefault();
  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
};

const handleResize = (e: MouseEvent) => {
  if (!resizeData.value) return;
  const { column, startX, startWidth } = resizeData.value;
  const delta = e.clientX - startX;
  const newWidth = Math.max(30, startWidth + delta);
  columnWidths.value[column] = newWidth;
};

const stopResize = () => {
  resizeData.value = null;
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
};

// Show error in modal
const showError = (message: string, details?: string) => {
  errorMessage.value = message;
  errorDetails.value = details || '';
  showErrorModal.value = true;
  console.error('[GRIST-BOM] Error:', message, details);
};

onMounted(async () => {
  console.warn('[GRIST-BOM] App mounted - widget loaded');
  
  // MUST call grist.ready() FIRST before any docApi calls
  if (typeof grist !== 'undefined') {
    console.warn('[GRIST-BOM] Calling grist.ready()...');
    grist.ready(); // No parameters - just signal that widget is ready
    console.warn('[GRIST-BOM] grist.ready() called');
  }

  // Wait for grist to be fully ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Load project list immediately
  console.warn('[GRIST-BOM] Fetching projects...');
  try {
    availableProjects.value = await fetchProjects();
    console.warn('[GRIST-BOM] Projects fetched:', availableProjects.value.length, 'items');
    if (availableProjects.value.length > 0) {
      console.warn('[GRIST-BOM] First 5 projects:', availableProjects.value.slice(0, 5).map(p => ({ id: p.id, Projekt: p.Projekt })));
    }
  } catch (err) {
    console.error('[GRIST-BOM] Failed to fetch projects:', err);
    showError('Nie udało się pobrać listy projektów. Upewnij się, że widget ma dostęp do Grist API.');
  }

  try {
    await initGristApi(async (_record) => {
      if (currentProjektId) {
        console.warn('[GRIST-BOM] Auto-detected projektId:', currentProjektId);
        autoDetectedProjektId.value = currentProjektId;
        if (!projektId.value) {
          projektId.value = currentProjektId;
        }
      }
    });
  } catch (err) {
    console.error('[GRIST-BOM] Failed to initialize Grist API:', err);
    showError('Nie udało się zainicjować połączenia z Grist API.');
  }
});

// Auto-refresh actions when projektId changes
watch(projektId, async (newProjektId) => {
  if (newProjektId && fileData.value.length > 0) {
    console.warn('[GRIST-BOM] Projekt changed to:', newProjektId, 'Refreshing actions...');
    try {
      await refreshActions();
    } catch (err) {
      console.error('[GRIST-BOM] Failed to refresh actions on project change:', err);
      showError('Nie udało się odświeżyć akcji po zmianie projektu.', String(err));
    }
  }
});

const handleDrop = async (e: DragEvent) => {
  const file = e.dataTransfer?.files[0];
  if (file) await processFile(file);
};

const handleFileSelect = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) await processFile(file);
  target.value = ''; // reset
};

const processFile = async (file: File) => {
  // Reset previous state
  validationErrors.value = [];
  validationWarnings.value = [];
  isLoading.value = true;
  
  try {
    console.warn('[GRIST-BOM] Processing file:', file.name, 'Size:', file.size);
    
    // 1. Parse Excel with validation
    const result = await parseBOMFile(file);
    
    // Check for validation errors
    if (!result.validation.isValid) {
      validationErrors.value = result.validation.errors;
      validationWarnings.value = result.validation.warnings;
      tree.value = [];
      fileData.value = [];
      isLoading.value = false;
      return;
    }
    
    // Store warnings if any
    if (result.validation.warnings.length > 0) {
      validationWarnings.value = result.validation.warnings;
      // Show warnings but continue processing
      console.warn('[GRIST-BOM] Warnings:', result.validation.warnings);
    }
    
    fileData.value = JSON.parse(JSON.stringify(result.nodes)); // deep copy — calculateDiff mutates nodes in-place
    
    // 2. Fetch Grist Data (we don't need to store it, refreshActions will fetch fresh data)
    
    // 3. Diff and create tree
    await refreshActions();
    
  } catch (err: any) {
    console.error('[GRIST-BOM] Error processing file:', err);
    validationErrors.value = ['Wystąpił nieoczekiwany błąd podczas przetwarzania pliku.'];
    if (err.message) {
      validationErrors.value.push(err.message);
    }
    tree.value = [];
    fileData.value = [];
  } finally {
    isLoading.value = false;
  }
};

const refreshActions = async () => {
  if (!fileData.value?.length) return;
  
  if (!projektId.value) {
    showError('Wybierz projekt przed odświeżeniem akcji.');
    return;
  }
  
  try {
    const gristData = await fetchGristData();
    console.warn('[GRIST-BOM] gristData.cad length:', gristData.cad?.length || 0);
    console.warn('[GRIST-BOM] gristData.struct length:', gristData.struct?.length || 0);
    tree.value = calculateDiff(fileData.value, gristData.cad, gristData.struct, projektId.value);
    console.warn('[GRIST-BOM] Actions refreshed for projektId:', projektId.value, 'Tree nodes:', tree.value.length);
  } catch (err: any) {
    console.error('[GRIST-BOM] Failed to refresh actions:', err);
    
    // Handle specific error types
    if (err instanceof GristPermissionError) {
      showError('Błąd uprawnień', err.message);
    } else if (err instanceof GristNetworkError) {
      showError('Błąd połączenia z Grist: ' + err.message + '. ' + String(err.originalError));
    } else if (err instanceof GristTimeoutError) {
      showError('Czas połączenia wygasł', err.message);
    } else {
      showError('Nie udało się odświeżyć akcji. Sprawdź połączenie z Grist.', String(err));
    }
  }
};

const reset = () => {
  tree.value = [];
  fileData.value = [];
  validationErrors.value = [];
  validationWarnings.value = [];
};

const confirmSync = async () => {
  if (!projektId.value) {
    showError('Musisz wybrać projekt przed synchronizacją.');
    return;
  }
  
  showConfirmSync.value = false;
  isSyncing.value = true;
  
  try {
    await syncToGrist(tree.value, projektId.value);
    showErrorModal.value = false;
    reset(); // Clear tree after successful sync
    // Show success message
    setTimeout(() => {
      alert('✅ Synchronizacja zakończona sukcesem!');
    }, 100);
  } catch (err: any) {
    console.error('[GRIST-BOM] Sync error:', err);
    
    // Handle specific error types
    if (err instanceof GristPermissionError) {
      showError('Błąd uprawnień', err.message);
    } else if (err instanceof GristNetworkError) {
      showError('Błąd połączenia z Grist: ' + err.message + '. ' + String(err.originalError));
    } else if (err instanceof GristTimeoutError) {
      showError('Czas połączenia wygasł', err.message);
    } else {
      showError('Wystąpił błąd podczas synchronizacji z Grist.', String(err));
    }
  } finally {
    isSyncing.value = false;
  }
};


</script>

<style>
:root {
  --bg-color: #0f172a;
  --panel-bg: #1e293b;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --primary: #3b82f6;
  --primary-hover: #2563eb;
}

body, html {
  margin: 0;
  padding: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background-color: var(--bg-color);
  color: var(--text-main);
  height: 100vh;
}

.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.header {
  padding: 0.75rem 1.5rem;
  background-color: var(--panel-bg);
  border-bottom: 1px solid rgba(255,255,255,0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.header h1 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.project-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.project-label {
  font-size: 0.8rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.project-select {
  background-color: #0f172a;
  color: var(--text-main);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s;
  max-width: 260px;
}

.project-select:hover,
.project-select:focus {
  border-color: var(--primary);
}

.auto-badge {
  font-size: 0.75rem;
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 20px;
  padding: 2px 10px;
  white-space: nowrap;
}

.warn-badge {
  font-size: 0.75rem;
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 20px;
  padding: 2px 10px;
  white-space: nowrap;
}

.content {
  flex: 1;
  padding: 2rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.upload-zone {
  flex: 1;
  border: 2px dashed rgba(255,255,255,0.2);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.02);
  transition: all 0.2s;
  cursor: pointer;
}

.upload-zone:hover {
  background: rgba(255,255,255,0.05);
  border-color: var(--primary);
}

.hidden-input {
  display: none;
}

.upload-content {
  text-align: center;
}

.upload-content .icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.tree-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--panel-bg);
  border-radius: 12px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.toolbar {
  padding: 1rem 1.5rem;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  background: linear-gradient(180deg, var(--panel-bg) 0%, rgba(30, 41, 59, 0.8) 100%);
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background-color: var(--primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--primary-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: transparent;
  color: var(--text-main);
  border: 1px solid rgba(255,255,255,0.2);
}

.btn-secondary:hover {
  background-color: rgba(255,255,255,0.1);
}

.tree-header {
  display: flex;
  background-color: var(--panel-bg);
  border-bottom: 2px solid rgba(59, 130, 246, 0.3);
  font-size: 12px;
  text-transform: uppercase;
  color: var(--text-muted);
  font-weight: 700;
  letter-spacing: 0.05em;
  position: sticky;
  top: 0;
  z-index: 10;
  width: 100%;
}

.tree-header > div {
  padding: 8px 12px;
  border-right: 1px solid rgba(255,255,255,0.1);
  background-color: var(--panel-bg);
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.tree-header > div:last-child {
  border-right: none;
}

.tree-body {
  width: 100%;
}

.tree-table-wrapper {
  flex: 1;
  display: block;
  overflow: auto;
  border-radius: 0 0 12px 12px;
}

/* Widths must match TreeNode.vue - dynamic widths */
.col-expand { width: v-bind("columnWidths['col-expand'] + 'px'"); text-align: center; min-width: v-bind("columnWidths['col-expand'] + 'px'"); position: relative; }
.col-check { width: v-bind("columnWidths['col-check'] + 'px'"); text-align: center; min-width: v-bind("columnWidths['col-check'] + 'px'"); position: relative; }
.col-item { width: v-bind("columnWidths['col-item'] + 'px'"); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: v-bind("columnWidths['col-item'] + 'px'"); position: relative; }
.col-part { width: v-bind("columnWidths['col-part'] + 'px'"); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: v-bind("columnWidths['col-part'] + 'px'"); position: relative; }
.col-bom-struct { width: v-bind("columnWidths['col-bom-struct'] + 'px'"); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: v-bind("columnWidths['col-bom-struct'] + 'px'"); position: relative; }
.col-qty { width: v-bind("columnWidths['col-qty'] + 'px'"); text-align: right; white-space: nowrap; min-width: v-bind("columnWidths['col-qty'] + 'px'"); position: relative; }
.col-desc { flex: 1; text-align: left; min-width: v-bind("columnWidths['col-desc'] + 'px'"); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; position: relative; }
.col-stock { width: v-bind("columnWidths['col-stock'] + 'px'"); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: v-bind("columnWidths['col-stock'] + 'px'"); position: relative; }
.col-rev { width: v-bind("columnWidths['col-rev'] + 'px'"); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: v-bind("columnWidths['col-rev'] + 'px'"); position: relative; }
.col-material { width: v-bind("columnWidths['col-material'] + 'px'"); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: v-bind("columnWidths['col-material'] + 'px'"); position: relative; }
.col-appearance { width: v-bind("columnWidths['col-appearance'] + 'px'"); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: v-bind("columnWidths['col-appearance'] + 'px'"); position: relative; }
.col-mass { width: v-bind("columnWidths['col-mass'] + 'px'"); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: v-bind("columnWidths['col-mass'] + 'px'"); position: relative; }
.col-vendor { width: v-bind("columnWidths['col-vendor'] + 'px'"); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: v-bind("columnWidths['col-vendor'] + 'px'"); position: relative; }
.col-action { width: v-bind("columnWidths['col-action'] + 'px'"); text-align: left; white-space: nowrap; min-width: v-bind("columnWidths['col-action'] + 'px'"); position: relative; }

/* Resize handle styles */
.tree-header > div > .resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s;
  z-index: 20;
}

.tree-header > div > .resize-handle:hover {
  background: rgba(59, 130, 246, 0.5);
}

.tree-header > div:last-child > .resize-handle {
  display: none;
}

/* Validation Errors */
.validation-errors {
  flex: 1;
  background-color: var(--panel-bg);
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid rgba(239, 68, 68, 0.3);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
}

.error-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.error-icon {
  font-size: 1.5rem;
  color: #ef4444;
}

.error-header h3 {
  margin: 0;
  color: #fca5a5;
}

.error-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1.5rem 0;
}

.error-item {
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  background-color: rgba(239, 68, 68, 0.1);
  border-left: 3px solid #ef4444;
  border-radius: 0 6px 6px 0;
  color: #fca5a5;
}

.warnings-section {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.warnings-section h4 {
  margin: 0 0 0.75rem 0;
  color: #fbbf24;
}

.warning-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.warning-item {
  padding: 0.5rem 1rem;
  margin-bottom: 0.5rem;
  background-color: rgba(251, 191, 36, 0.1);
  border-left: 3px solid #fbbf24;
  border-radius: 0 6px 6px 0;
  color: #fbbf24;
  font-size: 0.9rem;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background-color: var(--panel-bg);
  border-radius: 12px;
  padding: 1.5rem;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-main);
}

.modal-body {
  margin-bottom: 1.5rem;
}

.modal-body p {
  margin: 0 0 1rem 0;
  color: var(--text-main);
}

.sync-summary {
  background-color: rgba(255, 255, 255, 0.05);
  padding: 1rem;
  border-radius: 8px;
  margin: 1rem 0;
}

.sync-summary ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.sync-summary li {
  padding: 0.25rem 0;
  color: var(--text-main);
}

.sync-summary strong {
  color: var(--primary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.error-modal {
  border-color: rgba(239, 68, 68, 0.3);
}

.error-modal .modal-header h3 {
  color: #fca5a5;
}

.error-message {
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  color: #fca5a5;
  margin: 1rem 0;
}

.error-details {
  margin-top: 1rem;
  padding: 0.75rem;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  font-size: 0.85rem;
  overflow-x: auto;
}

.error-details h4 {
  margin: 0 0 0.5rem 0;
  color: var(--text-muted);
}

.error-details pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-main);
}

/* Loading Overlay */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  color: var(--text-main);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-overlay p {
  margin: 0;
  font-size: 1.1rem;
}
</style>
