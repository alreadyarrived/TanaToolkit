import { loadSettings, saveSettings } from './settings.js';

document.addEventListener('DOMContentLoaded', async function() {
  const webCaptureDiv = document.getElementById('webCapture');
  const tanaToolsDiv = document.getElementById('tanaTools');
  const captureButton = document.getElementById('captureButton');
  const fsrsButton = document.getElementById('fsrsButton');
  const statusMessage = document.getElementById('statusMessage');
  const toggleSettingsButton = document.getElementById('toggleSettings');
  const settingsDiv = document.getElementById('settings');
  const saveSettingsButton = document.getElementById('saveSettings');
  
  const tanaApiKeyInput = document.getElementById('tanaApiKey');
  const inboxNodeIdInput = document.getElementById('inboxNodeId');
  const decayFactorInput = document.getElementById('decayFactor');
  const difficultyAdditionInput = document.getElementById('difficultyAddition');
  const stabilityAdditionInput = document.getElementById('stabilityAddition');
  const reviewsPerSessionInput = document.getElementById('reviewsPerSession');

  const highlightToggle = document.getElementById('highlightToggle');
  const highlightBackgroundColorInput = document.getElementById('highlightBackgroundColor');
  const highlightTextColorInput = document.getElementById('highlightTextColor');

  // Load and display current settings
  const settings = await loadSettings();
  tanaApiKeyInput.value = settings.tanaApiKey;
  inboxNodeIdInput.value = settings.inboxNodeId;
  decayFactorInput.value = settings.fsrs.decayFactor;
  difficultyAdditionInput.value = settings.fsrs.difficultyAddition;
  stabilityAdditionInput.value = settings.fsrs.stabilityAddition;
  reviewsPerSessionInput.value = settings.fsrs.reviewsPerSession;
  highlightBackgroundColorInput.value = settings.highlightStyle.backgroundColor;
  highlightTextColorInput.value = settings.highlightStyle.textColor;

  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentUrl = tabs[0].url;
    if (currentUrl.includes('tana.inc')) {
      webCaptureDiv.style.display = 'none';
      tanaToolsDiv.style.display = 'block';
    } else {
      webCaptureDiv.style.display = 'block';
      tanaToolsDiv.style.display = 'none';
      chrome.tabs.sendMessage(tabs[0].id, {action: "getHighlights"}, function(response) {
        if (response && response.highlights) {
          highlightToggle.checked = response.highlights.length > 0;
        }
      });
    }
  });

  highlightToggle.addEventListener('change', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "toggleHighlightMode",
        enabled: highlightToggle.checked
      }, function(response) {
        console.log("Highlight mode set to:", response.highlightMode);
      });
    });
  });

  captureButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const url = tabs[0].url;
      const title = tabs[0].title;
      console.log('Attempting to capture:', { url, title });
      chrome.tabs.sendMessage(tabs[0].id, { action: "getHighlights" }, function(response) {
        const highlights = response ? response.highlights : [];
        chrome.runtime.sendMessage({
          action: "captureForTana",
          data: { url, title, highlights }
        }, function(response) {
          console.log('Capture response:', response);
          if (response && response.success) {
            statusMessage.textContent = "Page captured successfully!";
            statusMessage.style.color = "green";
          } else {
            statusMessage.textContent = "Failed to capture page. Please try again.";
            statusMessage.style.color = "red";
            console.error('Capture error:', response ? response.error : 'No response');
          }
        });
      });
    });
  });

  fsrsButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "startSpacedRepetition"});
    });
    window.close(); // Close the popup after initiating the review
  });

  toggleSettingsButton.addEventListener('click', function() {
    if (settingsDiv.style.display === 'none' || settingsDiv.style.display === '') {
      settingsDiv.style.display = 'block';
      toggleSettingsButton.textContent = 'Hide Settings';
    } else {
      settingsDiv.style.display = 'none';
      toggleSettingsButton.textContent = 'Settings';
    }
  });

  // Debounce function to limit the rate of function execution
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  saveSettingsButton.addEventListener('click', debounce(async function() {
    const newSettings = {
      tanaApiKey: tanaApiKeyInput.value,
      inboxNodeId: inboxNodeIdInput.value,
      fsrs: {
        decayFactor: parseFloat(decayFactorInput.value),
        difficultyAddition: parseFloat(difficultyAdditionInput.value),
        stabilityAddition: parseFloat(stabilityAdditionInput.value),
        reviewsPerSession: parseInt(reviewsPerSessionInput.value, 10)
      },
      highlightStyle: {
        backgroundColor: highlightBackgroundColorInput.value,
        textColor: highlightTextColorInput.value
      }
    };
    await saveSettings(newSettings);
    statusMessage.textContent = "Settings saved successfully!";
    statusMessage.style.color = "green";
  }, 300));
});