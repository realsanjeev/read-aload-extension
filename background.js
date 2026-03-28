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
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // List of commands that require the offscreen document
    const offscreenCommands = ['CMD_PLAY', 'CMD_INIT', 'CMD_TEST', 'CMD_DETECT_LANG', 'CMD_GET_STATE', 'CMD_STOP', 'CMD_NEXT', 'CMD_PREV', 'CMD_JUMP', 'CMD_TOGGLE_PLAY', 'CMD_PAUSE', 'CMD_UPDATE_SETTINGS'];

    if (offscreenCommands.includes(msg.type)) {
        handleOffscreenCommand(msg, sendResponse);
        return true; // Keep channel open for async response
    }
});

async function handleOffscreenCommand(msg, sendResponse) {
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);

    // Proxy the message. Since we just ensured the offscreen doc exists,
    // we re-broadcast to ensure the newly created document hears it if it was the one triggering creation.
    // However, chrome.runtime.sendMessage will reach everyone EXCEPT the sender.
    // If popup sent this, it won't get it back here, but offscreen will.
    chrome.runtime.sendMessage(msg, (response) => {
        if (sendResponse) sendResponse(response);
    });
}
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
