const DEFAULT_SETTINGS = {
    base_input: true,
    base_output: true,
    base_model: true,
    base_created: true,
    col_usage: true,
    col_id: false,
    col_temperature: false,
    col_presence_penalty: false,
    col_frequency_penalty: false,
    col_metadata: false
  };
  
  chrome.runtime.onInstalled.addListener(async () => {
    const existing = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
    const toSet = {};
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (typeof existing[key] === "undefined") toSet[key] = value;
    }
    if (Object.keys(toSet).length) await chrome.storage.local.set(toSet);
  });
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "OLE_PING") {
      sendResponse({ ok: true });
      return;
    }
  });
  