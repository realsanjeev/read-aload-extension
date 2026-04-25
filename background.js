// background.js

let creating; // Global promise to avoid concurrency issues

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

// Listen for messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // List of commands that require the offscreen document
    const offscreenCommands = [
        'CMD_PLAY', 'CMD_INIT', 'CMD_TEST', 'CMD_DETECT_LANG', 
        'CMD_GET_STATE', 'CMD_STOP', 'CMD_NEXT', 'CMD_PREV', 
        'CMD_JUMP', 'CMD_TOGGLE_PLAY', 'CMD_PAUSE', 'CMD_UPDATE_SETTINGS'
    ];

    if (offscreenCommands.includes(msg.type)) {
        handleOffscreenCommand(msg, sendResponse);
        return true; // Keep channel open for async response
    }
});

async function handleOffscreenCommand(msg, sendResponse) {
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);

    // Proxy the message. 
    // Small delay to ensure the script in the offscreen document has registered its listeners
    // Alternatively, we could implement a handshake, but 50ms is usually enough for local scripts.
    setTimeout(() => {
        chrome.runtime.sendMessage(msg, (response) => {
            if (chrome.runtime.lastError) {
                // If it fails, maybe try one more time or just report error
                console.warn("Background: Send failed, retrying once...", chrome.runtime.lastError.message);
                chrome.runtime.sendMessage(msg, (res2) => {
                    if (sendResponse) sendResponse(res2);
                });
            } else {
                if (sendResponse) sendResponse(response);
            }
        });
    }, 50);
}

// Listen for keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
    // Ensure offscreen document exists before sending commands
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);

    const msgMap = {
        'play_stop': 'CMD_TOGGLE_PLAY',
        'pause_resume': 'CMD_PAUSE',
        'forward': 'CMD_NEXT',
        'rewind': 'CMD_PREV'
    };

    if (msgMap[command]) {
        setTimeout(() => {
            chrome.runtime.sendMessage({ type: msgMap[command] });
        }, 50);
    }
});

