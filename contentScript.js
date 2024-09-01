// We'll need to implement these functions in this file since we can't import them
function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (items) => {
      resolve(items);
    });
  });
}

// FSRS constants and helper functions
const DECAY = 0.9;
const DIFFICULTY_DECAY = 0.9;
const STABILITY_DECAY = 0.9;
const DIFFICULTY_ADDITION = 0.2;
const STABILITY_ADDITION = 0.2;

function calculateInitialDifficulty(quality) {
  return Math.min(Math.max(1 + (5 - quality) * DIFFICULTY_ADDITION, 1), 10);
}

function calculateInitialStability(quality) {
  return Math.max(quality * STABILITY_ADDITION, 0.1);
}

function calculateNextInterval(stability) {
  return Math.ceil(stability);
}

function calculateNewDifficulty(oldDifficulty, quality) {
  return Math.min(Math.max(oldDifficulty + (5 - quality) * DIFFICULTY_ADDITION * (1 - DIFFICULTY_DECAY), 1), 10);
}

function calculateNewStability(oldStability, difficulty, quality, elapsedDays) {
  const retrievability = Math.exp(Math.log(0.9) * elapsedDays / oldStability);
  const newStability = oldStability * (1 + Math.exp(11 - difficulty) * (1 / retrievability - 1) * STABILITY_DECAY * (quality / 5));
  return Math.max(newStability, 0.1);
}

class FSRSItem {
  constructor(id, question, answer, difficulty = null, stability = null, lastReviewDate = null) {
    this.id = id;
    this.question = question;
    this.answer = answer;
    this.difficulty = difficulty;
    this.stability = stability;
    this.lastReviewDate = lastReviewDate ? new Date(lastReviewDate) : new Date();
    this.nextReviewDate = new Date(this.lastReviewDate);
  }

  updateReview(quality, currentDate = new Date()) {
    const elapsedDays = (currentDate - this.lastReviewDate) / (1000 * 60 * 60 * 24);

    if (this.difficulty === null || this.stability === null) {
      this.difficulty = calculateInitialDifficulty(quality);
      this.stability = calculateInitialStability(quality);
    } else {
      this.difficulty = calculateNewDifficulty(this.difficulty, quality);
      this.stability = calculateNewStability(this.stability, this.difficulty, quality, elapsedDays);
    }

    const interval = calculateNextInterval(this.stability);
    this.lastReviewDate = currentDate;
    this.nextReviewDate = new Date(currentDate.getTime() + interval * 24 * 60 * 60 * 1000);
  }
}

function initializeSpacedRepetition(items) {
  return items.map(item => new FSRSItem(
    item.id,
    item.question,
    item.answer,
    item.difficulty,
    item.stability,
    item.lastReviewDate
  ));
}

function getNextReviewItem(items, currentDate = new Date()) {
  return items.find(item => item.nextReviewDate <= currentDate);
}

let reviewItems = [];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startSpacedRepetition") {
    startSpacedRepetition();
  } else if (request.action === "toggleHighlightModeContext") {
    highlightMode = !highlightMode;
    console.log("Highlight mode toggled via context menu:", highlightMode);
    if (highlightMode) {
      if (isPDF()) {
        window.addEventListener('mouseup', handleHighlight);
        createHighlightOverlay();
      } else {
        document.addEventListener('mouseup', handleHighlight);
      }
    } else {
      if (isPDF()) {
        window.removeEventListener('mouseup', handleHighlight);
        if (highlightOverlay) {
          document.body.removeChild(highlightOverlay);
          highlightOverlay = null;
        }
      } else {
        document.removeEventListener('mouseup', handleHighlight);
      }
    }
    sendResponse({success: true, highlightMode: highlightMode});
  }
});

async function fetchReviewItemsFromTana() {
  const settings = await loadSettings();
  try {
    const response = await fetch('https://api.tana.inc/api/v0/getNodes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.tanaApiKey}`
      },
      body: JSON.stringify({
        filter: {
          type: 'node',
          attribute: 'supertags',
          value: '#SpacedRepetitionItem'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const items = await response.json();
    return items.map(item => ({
      id: item.id,
      question: item.name,
      answer: item.children[0]?.name || '',
      difficulty: item.fields?.difficulty || null,
      stability: item.fields?.stability || null,
      lastReviewDate: item.fields?.lastReviewDate || null
    }));
  } catch (error) {
    console.error('Error fetching review items from Tana:', error);
    return [];
  }
}

async function saveReviewItemToTana(item) {
  const settings = await loadSettings();
  try {
    const response = await fetch('https://api.tana.inc/api/v0/updateNode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.tanaApiKey}`
      },
      body: JSON.stringify({
        id: item.id,
        fields: {
          difficulty: item.difficulty,
          stability: item.stability,
          lastReviewDate: item.lastReviewDate.toISOString(),
          nextReviewDate: item.nextReviewDate.toISOString()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error saving review item to Tana:', error);
  }
}

async function startSpacedRepetition() {
  const settings = await loadSettings();
  reviewItems = await fetchReviewItemsFromTana();
  reviewItems = initializeSpacedRepetition(reviewItems);
  
  let reviewedCount = 0;
  
  async function showNextItem() {
    if (reviewedCount >= settings.spacedRepetition.reviewsPerSession) {
      alert("Review session complete!");
      return;
    }

    const item = getNextReviewItem(reviewItems);
    if (!item) {
      alert("No more items to review!");
      return;
    }

    const quality = await promptForQuality(item);
    item.updateReview(quality);
    await saveReviewItemToTana(item);
    reviewedCount++;

    showNextItem();
  }

  showNextItem();
}

async function promptForQuality(item) {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.innerHTML = `
      <h3>${item.question}</h3>
      <p>${item.answer}</p>
      <p>How well did you remember this?</p>
      <button data-quality="1">1 (Complete blackout)</button>
      <button data-quality="2">2 (Incorrect response; the correct one remembered)</button>
      <button data-quality="3">3 (Incorrect response; where the correct one seemed easy to recall)</button>
      <button data-quality="4">4 (Correct response recalled with serious difficulty)</button>
      <button data-quality="5">5 (Perfect response)</button>
    `;
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 0 10px rgba(0,0,0,0.5);
      z-index: 10000;
    `;
    document.body.appendChild(dialog);

    dialog.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        const quality = parseInt(e.target.dataset.quality);
        document.body.removeChild(dialog);
        resolve(quality);
      }
    });
  });
}

async function addNewItemToTana(item) {
  const settings = await loadSettings();
  try {
    const response = await fetch('https://api.tana.inc/api/v0/addNode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.tanaApiKey}`
      },
      body: JSON.stringify({
        name: item.question,
        children: [{ name: item.answer }],
        supertags: ["#SpacedRepetitionItem"],
        fields: {
          difficulty: item.difficulty,
          stability: item.stability,
          lastReviewDate: item.lastReviewDate.toISOString(),
          nextReviewDate: item.nextReviewDate.toISOString()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error adding new item to Tana:', error);
  }
}

async function addNewReviewItem(question, answer) {
  const newItem = new FSRSItem(
    null, // ID will be assigned by Tana
    question,
    answer
  );

  const addedItem = await addNewItemToTana(newItem);
  if (addedItem) {
    newItem.id = addedItem.id;
    reviewItems.push(newItem);
  }
}

// Expose addNewReviewItem to the global scope so it can be called from the console or other scripts
window.addNewReviewItem = addNewReviewItem;

let highlightMode = false;
let highlights = [];
let highlightStyle = {
  backgroundColor: 'yellow',
  textColor: 'black'
};

// Load settings when the content script initializes
loadSettings().then(settings => {
  highlightStyle = settings.highlightStyle || highlightStyle;
});

let highlightOverlay;

function createHighlightOverlay() {
  highlightOverlay = document.createElement('div');
  highlightOverlay.id = 'tana-highlight-overlay';
  highlightOverlay.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    width: 250px;
    max-height: 80vh;
    overflow-y: auto;
    background-color: rgba(255, 255, 255, 0.9);
    border: 1px solid #ccc;
    border-radius: 5px;
    padding: 10px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  `;
  document.body.appendChild(highlightOverlay);
}

function updateHighlightOverlay() {
  if (!highlightOverlay) {
    createHighlightOverlay();
  }
  highlightOverlay.innerHTML = `
    <h3 style="margin-top: 0;">Highlights</h3>
    ${highlights.map((highlight, index) => `
      <div style="margin-bottom: 10px; padding: 5px; background-color: ${highlightStyle.backgroundColor}; color: ${highlightStyle.textColor};">
        ${highlight}
        <button class="remove-highlight" data-index="${index}" style="float: right; background: none; border: none; cursor: pointer;">×</button>
      </div>
    `).join('')}
  `;
  
  // Add event listeners to remove buttons
  highlightOverlay.querySelectorAll('.remove-highlight').forEach(button => {
    button.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'));
      highlights.splice(index, 1);
      updateHighlightOverlay();
    });
  });
}

function handleHighlight(event) {
  if (!highlightMode) return;

  let selectedText;
  if (isPDF()) {
    selectedText = window.getSelection().toString().trim();
    if (selectedText) {
      console.log("Text selected in PDF:", selectedText);
      highlights.push(selectedText);
      updateHighlightOverlay();
    }
  } else {
    // For regular web pages, keep the existing highlighting logic
    const selection = window.getSelection();
    selectedText = selection.toString().trim();
    if (selectedText) {
      console.log("Text selected:", selectedText);
      highlights.push(selectedText);
      const range = selection.getRangeAt(0);
      const span = document.createElement('span');
      span.style.backgroundColor = highlightStyle.backgroundColor;
      span.style.color = highlightStyle.textColor;
      span.style.textShadow = 'none';
      span.textContent = selectedText;
      range.deleteContents();
      range.insertNode(span);
      selection.removeAllRanges();
    }
  }
}

// Modify the listener to handle the highlight overlay
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleHighlightMode") {
    highlightMode = request.enabled;
    console.log("Highlight mode toggled:", highlightMode);
    if (highlightMode) {
      if (isPDF()) {
        window.addEventListener('mouseup', handleHighlight);
        createHighlightOverlay();
      } else {
        document.addEventListener('mouseup', handleHighlight);
      }
    } else {
      if (isPDF()) {
        window.removeEventListener('mouseup', handleHighlight);
        if (highlightOverlay) {
          document.body.removeChild(highlightOverlay);
          highlightOverlay = null;
        }
      } else {
        document.removeEventListener('mouseup', handleHighlight);
      }
    }
    sendResponse({success: true, highlightMode: highlightMode});
  } else if (request.action === "getHighlights") {
    sendResponse({highlights: highlights});
  }
  return true; // Keeps the message channel open for asynchronous responses
});

// Add this function to check if the current page is a PDF
function isPDF() {
  return document.body.innerHTML.indexOf('pdf-viewer') !== -1;
}

// Log when the content script is loaded
console.log("Content script loaded");