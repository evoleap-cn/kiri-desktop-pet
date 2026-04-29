/**
 * Preload script for expert review window
 * Provides IPC communication between main process and renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reviewAPI', {
  // Receive initial review data from main process
  onReviewData: (callback) => ipcRenderer.on('expert-review:data', (_event, data) => callback(data)),

  // Submit edited review data back to main process
  submitReview: (data) => ipcRenderer.invoke('expert-review:submit', data),

  // Notify main process that review is complete
  completeReview: (data) => ipcRenderer.invoke('expert-review:complete', data),

  // Close the review window
  closeWindow: () => ipcRenderer.send('expert-review:close'),

  // Minimize the review window
  minimizeWindow: () => ipcRenderer.send('expert-review:minimize'),

  // Auto-save review data (debounced)
  autoSave: (data) => ipcRenderer.send('expert-review:auto-save', data),
});
