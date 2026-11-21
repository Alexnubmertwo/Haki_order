// Electron не поддерживает window.prompt, а интерфейс Haki им пользуется.
// Подменяем его на диалог, который открывает главный процесс.
const { ipcRenderer } = require('electron');

window.prompt = (message, def) =>
  ipcRenderer.sendSync(
    'haki-prompt',
    String(message == null ? '' : message),
    def == null ? '' : String(def)
  );
