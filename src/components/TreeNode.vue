<template>
  <div class="tree-node">
    <div 
      class="node-row" 
      :class="{ 'is-deleted': node.status === 'Usunięty', 'is-new': node.action === 'create', 'is-child': node.parentItem !== null }"
    >
      <div class="col-expand">
        <button v-if="node.children.length" @click="toggleExpand" class="expand-btn">
          {{ node.expanded ? '▼' : '▶' }}
        </button>
      </div>
      <div class="col-check">
        <input type="checkbox" v-model="node.selected" @change="onCheckChange" class="row-checkbox" />
      </div>
      <div class="col-item">{{ node.item }}</div>
      <div class="col-part">{{ node.partNumber }}</div>
      <div class="col-bom-struct">{{ node.bomStructure }}</div>
      <div class="col-qty">{{ node.qty }}</div>
      <div class="col-desc">{{ node.description }}</div>
      <div class="col-stock">{{ node.rawData.Stock_Number || node.rawData['Stock Number'] || '' }}</div>
      <div class="col-rev">{{ node.rawData.REV || node.rawData.Revision || '' }}</div>
      <div class="col-material">{{ node.rawData.Material || '' }}</div>
      <div class="col-appearance">{{ node.rawData.Appearance || '' }}</div>
      <div class="col-mass">{{ node.rawData.Mass || '' }}</div>
      <div class="col-vendor">{{ node.rawData.Vendor || '' }}</div>
      <div class="col-action">
        <span class="badge" :class="actionClass">{{ actionText }}</span>
      </div>
    </div>
    
    <div v-if="node.expanded && node.children.length" class="node-children">
      <TreeNode 
        v-for="child in node.children" 
        :key="child.item + child.partNumber" 
        :node="child"
        :columnWidths="columnWidths"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BOMNode } from '../utils/bomParser';

const props = defineProps<{
  node: BOMNode;
  columnWidths: Record<string, number>;
}>();

const toggleExpand = () => {
  props.node.expanded = !props.node.expanded;
};

const onCheckChange = (e: Event) => {
  const isChecked = (e.target as HTMLInputElement).checked;
  // Cascade to children
  cascadeCheck(props.node, isChecked);
};

const cascadeCheck = (n: BOMNode, checked: boolean) => {
  n.selected = checked;
  for (const child of n.children) {
    cascadeCheck(child, checked);
  }
};

const actionText = computed(() => {
  if (props.node.status === 'Usunięty') return 'Usuń (Soft)';
  if (props.node.action === 'create') return 'Utwórz';
  if (props.node.action === 'update') return 'Aktualizuj';
  return 'Bez zmian';
});

const actionClass = computed(() => {
  if (props.node.status === 'Usunięty') return 'badge-danger';
  if (props.node.action === 'create') return 'badge-success';
  if (props.node.action === 'update') return 'badge-warning';
  return 'badge-neutral';
});
</script>

<style scoped>
.tree-node {
  display: flex;
  flex-direction: column;
}
.node-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  transition: background-color 0.2s;
  font-size: 13px;
  overflow: visible;
  width: max-content;
  min-width: 100%;
  box-sizing: border-box;
}

.node-row > div {
  padding: 8px 12px;
  border-right: 1px solid rgba(255,255,255,0.05);
  box-sizing: border-box;
  flex-shrink: 0;
  flex-grow: 0;
}
.node-row:last-child > div:last-child {
  border-right: none;
}
.node-row:hover {
  background-color: rgba(59, 130, 246, 0.1);
}
.node-children {
  margin-left: 0;
}

.is-child .col-item {
  padding-left: 32px;
}
.is-deleted {
  opacity: 0.6;
  text-decoration: line-through;
}

/* Zebra striping for better readability */
.tree-node:nth-child(even) > .node-row {
  background-color: rgba(255, 255, 255, 0.02);
}
.tree-node:nth-child(even):hover > .node-row {
  background-color: rgba(59, 130, 246, 0.1);
}

.col-expand { width: v-bind("props.columnWidths['col-expand'] + 'px'"); min-width: v-bind("props.columnWidths['col-expand'] + 'px'"); max-width: v-bind("props.columnWidths['col-expand'] + 'px'"); text-align: center; justify-content: center; flex: 0 0 auto; }
.col-check { width: v-bind("props.columnWidths['col-check'] + 'px'"); min-width: v-bind("props.columnWidths['col-check'] + 'px'"); max-width: v-bind("props.columnWidths['col-check'] + 'px'"); text-align: center; justify-content: center; flex: 0 0 auto; }
.col-item { width: v-bind("props.columnWidths['col-item'] + 'px'"); min-width: v-bind("props.columnWidths['col-item'] + 'px'"); max-width: v-bind("props.columnWidths['col-item'] + 'px'"); font-weight: 500; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 0 auto; }
.col-part { width: v-bind("props.columnWidths['col-part'] + 'px'"); min-width: v-bind("props.columnWidths['col-part'] + 'px'"); max-width: v-bind("props.columnWidths['col-part'] + 'px'"); font-family: monospace; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 0 auto; }
.col-bom-struct { width: v-bind("props.columnWidths['col-bom-struct'] + 'px'"); min-width: v-bind("props.columnWidths['col-bom-struct'] + 'px'"); max-width: v-bind("props.columnWidths['col-bom-struct'] + 'px'"); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 0 auto; }
.col-qty { width: v-bind("props.columnWidths['col-qty'] + 'px'"); min-width: v-bind("props.columnWidths['col-qty'] + 'px'"); max-width: v-bind("props.columnWidths['col-qty'] + 'px'"); text-align: right; justify-content: flex-end; white-space: nowrap; font-variant-numeric: tabular-nums; flex: 0 0 auto; }
.col-desc { width: v-bind("props.columnWidths['col-desc'] + 'px'"); min-width: v-bind("props.columnWidths['col-desc'] + 'px'"); max-width: v-bind("props.columnWidths['col-desc'] + 'px'"); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; flex: 0 0 auto; }
.col-stock { width: v-bind("props.columnWidths['col-stock'] + 'px'"); min-width: v-bind("props.columnWidths['col-stock'] + 'px'"); max-width: v-bind("props.columnWidths['col-stock'] + 'px'"); text-align: left; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 0 auto; }
.col-rev { width: v-bind("props.columnWidths['col-rev'] + 'px'"); min-width: v-bind("props.columnWidths['col-rev'] + 'px'"); max-width: v-bind("props.columnWidths['col-rev'] + 'px'"); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 0 auto; }
.col-material { width: v-bind("props.columnWidths['col-material'] + 'px'"); min-width: v-bind("props.columnWidths['col-material'] + 'px'"); max-width: v-bind("props.columnWidths['col-material'] + 'px'"); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 0 auto; }
.col-appearance { width: v-bind("props.columnWidths['col-appearance'] + 'px'"); min-width: v-bind("props.columnWidths['col-appearance'] + 'px'"); max-width: v-bind("props.columnWidths['col-appearance'] + 'px'"); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 0 auto; }
.col-mass { width: v-bind("props.columnWidths['col-mass'] + 'px'"); min-width: v-bind("props.columnWidths['col-mass'] + 'px'"); max-width: v-bind("props.columnWidths['col-mass'] + 'px'"); text-align: right; justify-content: flex-end; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 0 auto; }
.col-vendor { width: v-bind("props.columnWidths['col-vendor'] + 'px'"); min-width: v-bind("props.columnWidths['col-vendor'] + 'px'"); max-width: v-bind("props.columnWidths['col-vendor'] + 'px'"); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 0 auto; }
.col-action { width: v-bind("props.columnWidths['col-action'] + 'px'"); min-width: v-bind("props.columnWidths['col-action'] + 'px'"); max-width: v-bind("props.columnWidths['col-action'] + 'px'"); text-align: left; white-space: nowrap; flex: 0 0 auto; }

/* Custom checkbox styling */
.row-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--primary);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background: transparent;
}
.row-checkbox:hover {
  filter: brightness(1.2);
}
.row-checkbox:checked {
  background: var(--primary);
  border-color: var(--primary);
}

.expand-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
  min-width: 24px;
}
.expand-btn:hover {
  background: rgba(59, 130, 246, 0.2);
  color: var(--primary);
}

.badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  display: inline-block;
}
.badge-success { background: rgba(16, 185, 129, 0.25); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
.badge-warning { background: rgba(245, 158, 11, 0.25); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
.badge-danger { background: rgba(239, 68, 68, 0.25); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
.badge-neutral { background: rgba(156, 163, 175, 0.2); color: #cbd5e1; border: 1px solid rgba(156, 163, 175, 0.3); }
</style>
