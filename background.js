// background.js

// Offscreen document path
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

// Create the offscreen document if it doesn't already exist
async function setupOffscreenDocument(path) {
    // Check if an offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [path]
    });

    if (existingContexts.length > 0) {
        return;
    }

    // Create offscreen document
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Playback of article text in the background',
        });
        await creating;
        creating = null;
    }
}

let creating; // A global promise to avoid concurrency issues

// Listen for messages from popup
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
    // Ensure offscreen document exists when we need to play
    if (msg.type === 'CMD_PLAY' || msg.type === 'CMD_INIT') {
        await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
    }
});
