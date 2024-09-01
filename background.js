import { loadSettings } from './settings.js';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in background:", request);
  if (request.action === "captureForTana") {
    console.log('Received capture request:', request.data);
    captureForTana(request.data)
      .then((result) => {
        console.log('Capture successful:', result);
        sendResponse({success: true, result});
      })
      .catch(error => {
        console.error('Error capturing for Tana:', error);
        sendResponse({success: false, error: error.message});
      });
    return true; // Indicates we will send a response asynchronously
  }
});

async function captureForTana(data) {
  const settings = await loadSettings();
  console.log('Using settings:', settings);
  
  if (!settings.tanaApiKey || !settings.inboxNodeId) {
    throw new Error('Tana API key or Inbox Node ID is missing. Please check your settings.');
  }

  // Remove newlines from the title
  const sanitizedTitle = data.title.replace(/\n/g, ' ').trim();

  try {
    console.log('Attempting to fetch from Tana API...');
    const response = await fetch('https://europe-west1-tagr-prod.cloudfunctions.net/addToNodeV2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.tanaApiKey}`
      },
      body: JSON.stringify({
        targetNodeId: settings.inboxNodeId,
        nodes: [
          {
            name: `[${sanitizedTitle}](${data.url})`,
            children: [
              { name: data.url },
              ...(data.highlights || []).map(highlight => ({ name: highlight.replace(/\n/g, ' ').trim() }))
            ]
          }
        ]
      })
    });

    console.log('Fetch response:', response);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Fetch error details:', error);
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      throw new Error('Network error: Unable to connect to Tana API. Please check your internet connection and Tana API status.');
    }
    throw error;
  }
}