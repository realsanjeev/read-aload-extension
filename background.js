// background.js

let creating; // Global promise to avoid concurrency issues

// Offscreen document path must be absolute for getContexts to match
const OFFSCREEN_DOCUMENT_PATH = chrome.runtime.getURL('offscreen.html');

// Create the offscreen document if it doesn't already exist
async function setupOffscreenDocument() {
    // Check if an offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [OFFSCREEN_DOCUMENT_PATH]
    });

    if (existingContexts.length > 0) {
        return;
    }

    // Create offscreen document
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: OFFSCREEN_DOCUMENT_PATH,
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Playback of article text in the background',
        });
        await creating;
        creating = null;
    }
}

// Listen for messages to ensure offscreen is ready
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'CMD_ENSURE_OFFSCREEN') {
        setupOffscreenDocument()
            .then(() => {
                // Add a small delay to ensure offscreen scripts have registered their listeners
                setTimeout(() => sendResponse({ status: 'ok' }), 50);
            })
            .catch(err => {
                console.error("Failed to create offscreen document:", err);
                sendResponse({ status: 'error', message: err.message });
            });
        return true; // Keep channel open for async response
    }
});

// Listen for keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
    // Ensure offscreen document exists before sending commands
    await setupOffscreenDocument();

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
