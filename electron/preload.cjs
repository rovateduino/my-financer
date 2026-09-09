const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
	getDeviceId: () => ipcRenderer.sendSync('my-financer:get-device-id')
});
