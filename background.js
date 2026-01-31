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
    // Ensure offscreen document exists when we need to play or test
    if (msg.type === 'CMD_PLAY' || msg.type === 'CMD_INIT' || msg.type === 'CMD_TEST') {
        await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
    }
});
// Listen for keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
    // Ensure offscreen document exists before sending commands
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);

    switch (command) {
        case 'play_stop':
            chrome.runtime.sendMessage({ type: 'CMD_TOGGLE_PLAY' });
            break;
        case 'pause_resume':
            chrome.runtime.sendMessage({ type: 'CMD_PAUSE' });
            break;
        case 'forward':
            chrome.runtime.sendMessage({ type: 'CMD_NEXT' });
            break;
        case 'rewind':
            chrome.runtime.sendMessage({ type: 'CMD_PREV' });
            break;
    }
});
