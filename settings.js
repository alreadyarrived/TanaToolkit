const defaultSettings = {
  tanaApiKey: '',
  inboxNodeId: '',
  fsrs: {
    decayFactor: 0.9,
    difficultyAddition: 0.2,
    stabilityAddition: 0.2,
    reviewsPerSession: 20
  },
  highlightStyle: {
    backgroundColor: 'yellow',
    textColor: 'black'
  }
};

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(defaultSettings, (items) => {
      resolve(items);
    });
  });
}

function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => {
      resolve();
    });
  });
}

export { loadSettings, saveSettings, defaultSettings };