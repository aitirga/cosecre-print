/** Channel names shared by the main process and the preload bridge. */
export const IPC = {
  listPrinters: 'printers:list',
  refreshPrinters: 'printers:refresh',
  converterStatus: 'converter:status',

  pickFiles: 'files:pick',
  addFiles: 'files:add',

  getJobs: 'jobs:list',
  updateJobOptions: 'jobs:update-options',
  applyOptionsToAll: 'jobs:apply-options-all',
  removeJob: 'jobs:remove',
  clearFinished: 'jobs:clear-finished',
  printJobs: 'jobs:print',
  cancelJob: 'jobs:cancel',
  retryJob: 'jobs:retry',
  readPrintable: 'jobs:read-printable',
  reportPageCount: 'jobs:report-page-count',

  getHistory: 'history:list',
  clearHistory: 'history:clear',

  getSettings: 'settings:get',
  setSettings: 'settings:set',

  getUpdateState: 'update:get',
  checkForUpdates: 'update:check',
  applyUpdate: 'update:apply',

  // main -> renderer
  jobsChanged: 'jobs:changed',
  historyChanged: 'history:changed',
  updateStateChanged: 'update:changed'
} as const
