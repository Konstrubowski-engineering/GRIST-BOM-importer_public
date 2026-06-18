// Type declarations for Grist Plugin API
// See: https://support.getgrist.com/api/

interface GristDocApi {
  fetchTable: (tableName: string) => Promise<any>;
  fetchSelectedTable: () => Promise<any>;
  applyUserActions: (actions: any[]) => Promise<any>;
  tables?: Record<string, { tableId: string }>;
}

interface GristWidgetApi {
  getOptions: () => Promise<any>;
}

interface GristAPI {
  ready: () => void;
  onRecord: (callback: (record: any) => void) => void;
  on: (event: string, callback: (event: any) => void) => void;
  docApi: GristDocApi;
  widgetApi?: GristWidgetApi;
}

// Declare grist as a global variable available in the browser when running in Grist
declare const grist: GristAPI;
