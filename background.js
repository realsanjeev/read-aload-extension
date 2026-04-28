// background.js

let creating; // Global promise to avoid concurrency issues

// Offscreen document path must be absolute for getContexts to match
const OFFSCREEN_DOCUMENT_PATH = chrome.runtime.getURL('offscreen.html');

// Create the offscreen document if it doesn't already exist
async function setupOffscreenDocument() {
    if (creating) {
        await creating;
    }

    // Check if an offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [OFFSCREEN_DOCUMENT_PATH]
    });

    if (existingContexts.length > 0) {
        return;
    }

    // Create offscreen document
    creating = chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Playback of article text in the background',
    }).finally(() => {
        creating = null;
    });

    await creating;
}

// Listen for messages to ensure offscreen is ready
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'CMD_ENSURE_OFFSCREEN') {
        setupOffscreenDocument()
            .then(() => {
                sendResponse({ status: 'ok' });
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
    try {
        // Ensure offscreen document exists before sending commands
        await setupOffscreenDocument();

        const msgMap = {
            'play_stop': 'CMD_TOGGLE_PLAY',
            'pause_resume': 'CMD_PAUSE',
            'forward': 'CMD_NEXT',
            'rewind': 'CMD_PREV'
        };

        if (msgMap[command]) {
            chrome.runtime.sendMessage({ type: msgMap[command] }, () => {
                if (chrome.runtime.lastError) {
                    console.warn("Command error:", chrome.runtime.lastError.message);
                }
            });
        }
    } catch (e) {
        console.error("Failed to execute command:", e);
    }
});
