// background.js - Orchestrator for Speak Aloud Extension

let offscreenCreated = false;
let offscreenCreating = null;
const OFFSCREEN_DOCUMENT_PATH = chrome.runtime.getURL('offscreen.html');

/**
 * Ensures the offscreen document is created and ready to receive messages.
 */
async function ensureOffscreen() {
    if (offscreenCreated) return;
    if (offscreenCreating) return offscreenCreating;

    offscreenCreating = (async () => {
        try {
            const existingContexts = await chrome.runtime.getContexts({
                contextTypes: ['OFFSCREEN_DOCUMENT'],
                documentUrls: [OFFSCREEN_DOCUMENT_PATH]
            });

            if (existingContexts.length === 0) {
                await chrome.offscreen.createDocument({
                    url: OFFSCREEN_DOCUMENT_PATH,
                    reasons: ['AUDIO_PLAYBACK'],
                    justification: 'Text-to-Speech playback',
                });
            }

            offscreenCreated = true;
        } finally {
            offscreenCreating = null;
        }
    })();

    return offscreenCreating;
}

// Removed waitForOffscreenReady as createDocument ensures readiness

// Proxy messages to offscreen
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Security: Validate sender origin if present
    if (sender.id && sender.id !== chrome.runtime.id) {
        console.warn("Unauthorized message origin:", sender.id);
        return;
    }

    // Internal background commands
    if (msg.type === 'CMD_ENSURE_OFFSCREEN') {
        ensureOffscreen()
            .then(() => sendResponse({ status: 'ok' }))
            .catch(err => sendResponse({ status: 'error', message: err.message }));
        return true;
    }

    // Forward player commands to offscreen
    if (msg.type && (msg.type.startsWith('CMD_') || msg.type === 'CMD_GET_STATE')) {
        if (msg._forwarded) return; // Prevent infinite recursion

        console.log("Background: Forwarding command to offscreen:", msg.type);
        ensureOffscreen().then(() => {
            const expectsResponse = ['CMD_GET_STATE', 'CMD_DETECT_LANG'].includes(msg.type);
            
            if (expectsResponse) {
                chrome.runtime.sendMessage({ ...msg, _forwarded: true }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn("Proxy error:", chrome.runtime.lastError.message);
                        sendResponse({ status: 'error', message: chrome.runtime.lastError.message });
                    } else {
                        sendResponse(response);
                    }
                });
            } else {
                chrome.runtime.sendMessage({ ...msg, _forwarded: true });
                sendResponse({ status: 'ok' });
            }
        });
        return true;
    }
});

// Listen for keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
    try {
        await ensureOffscreen();
        const msgMap = {
            'play_stop': 'CMD_TOGGLE_PLAY',
            'pause_resume': 'CMD_PAUSE',
            'forward': 'CMD_NEXT',
            'rewind': 'CMD_PREV'
        };
        if (msgMap[command]) {
            chrome.runtime.sendMessage({ type: msgMap[command], _forwarded: true });
        }
    } catch (e) {
        console.error("Keyboard command failed:", e);
    }
});
