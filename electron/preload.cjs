const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    generateGps: (data) => ipcRenderer.invoke('generate-gps', data),
    runMatlabVerification: () => ipcRenderer.invoke('run-matlab-verification'),
    fetchResults: () => ipcRenderer.invoke('fetch-results'),
    readRinexHeader: (filePath) => ipcRenderer.invoke('read-rinex-header', filePath),
    generateTrajectory: (data) => ipcRenderer.invoke('generate-trajectory', data),
    saveDrawnTrajectory: (data) => ipcRenderer.invoke('save-drawn-trajectory', data),
    parseMotionCsv: (filePath) => ipcRenderer.invoke('parse-motion-csv', filePath),
    selectFile: (options) => ipcRenderer.invoke('select-file', options),
    getSatVisibility: (data) => ipcRenderer.invoke('get-sat-visibility', data),
    onResultsUpdate: (callback) => ipcRenderer.on('results-updated', (event, data) => callback(data)),
    onVerificationStarted: (callback) => ipcRenderer.on('verification-started', (event, data) => callback(data)),
    onVerificationComplete: (callback) => ipcRenderer.on('verification-complete', (event, data) => callback(data)),
    onEngineLog: (callback) => ipcRenderer.on('engine-log', (event, data) => callback(data))
});
