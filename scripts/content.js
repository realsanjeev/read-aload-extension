// content.js - Optimized Content Extraction + Floating Mini-Player for Read Aloud Extension

console.log("[ReadAloud] Content script loaded.");

let miniPlayer = null;
let miniPlayerVisible = false;
let currentSentenceText = "";
let currentProgress = 0;
let currentIsPlaying = false;

// Listen for messages from the popup / background / offscreen
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'EXTRACT_CONTENT') {
        try {
            const content = extractContentFromPage();
            sendResponse({ result: content });
        } catch (err) {
            console.error("[ReadAloud] Extraction failed:", err);
            sendResponse({ error: err.message });
        }
        return true;
    }

    if (msg.type === 'UPDATE_UI') {
        const state = msg.state;
        if (state) {
            updateMiniPlayer(state);
        }
        sendResponse({ received: true });
        return false;
    }

    if (msg.type === 'TOGGLE_MINI_PLAYER') {
        if (msg.visible) {
            ensureMiniPlayer();
        } else {
            hideMiniPlayer();
        }
        sendResponse({ received: true });
        return false;
    }
});

function extractContentFromPage() {
    // 1. Check for user selection first (highest priority)
    const selection = window.getSelection().toString().trim();
    if (selection.length > 0) return selection;

    // 2. Use Readability.js if available
    if (typeof Readability !== 'undefined') {
        try {
            const documentClone = document.cloneNode(true);
            const reader = new Readability(documentClone);
            const article = reader.parse();
            
            if (article && article.content) {
                const div = document.createElement('div');
                div.innerHTML = article.content;
                const text = div.innerText.trim();
                if (text.length > 100) return text; // Use it if it seems substantial
            }
        } catch (e) {
            console.error("[ReadAloud] Readability parsing failed:", e);
        }
    }
    
    // 3. Fallback to basic innerText but try to be smart about common content areas
    const contentAreas = ['article', 'main', '.content', '.post', '#content', '#main'];
    for (const selector of contentAreas) {
        const el = document.querySelector(selector);
        if (el) {
            const text = el.innerText.trim();
            if (text.length > 200) return text;
        }
    }

    return document.body.innerText.trim();
}

// --- Floating Mini-Player ---

function ensureMiniPlayer() {
    if (miniPlayer) {
        miniPlayer.classList.remove('hidden');
        miniPlayerVisible = true;
        return;
    }

    // Request current state when first creating the mini-player
    chrome.runtime.sendMessage({ type: 'CMD_GET_STATE' }, (response) => {
        if (response && response.state) {
            updateMiniPlayer(response.state);
        }
    });

    const container = document.createElement('div');
    container.className = 'read-aloud-mini-player';
    container.id = 'readAloudMiniPlayer';
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Read aloud mini player');

    container.innerHTML = `
        <button class="mini-btn mini-toggle" aria-label="Play or pause">
            <svg class="mini-icon-play" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <svg class="mini-icon-pause hidden" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
        </button>
        <div class="mini-sentence" aria-live="polite" aria-atomic="true"></div>
        <button class="mini-btn mini-next" aria-label="Next sentence">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 4 15 12 5 20 5 4"></polygon>
            </svg>
        </button>
        <button class="mini-btn mini-stop" aria-label="Stop">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
            </svg>
        </button>
        <button class="mini-close" aria-label="Close mini player">&times;</button>
    `;

    // Inject styles if not already present
    if (!document.getElementById('readAloudMiniPlayerStyles')) {
        const style = document.createElement('style');
        style.id = 'readAloudMiniPlayerStyles';
        style.textContent = `
            .read-aloud-mini-player {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                gap: 10px;
                background: rgba(255,255,255,0.92);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(0,0,0,0.08);
                border-radius: 16px;
                padding: 10px 14px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.12);
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 0.85rem;
                color: #0f172a;
                transition: transform 0.3s ease, opacity 0.3s ease;
                max-width: 300px;
                line-height: 1.4;
            }
            @media (prefers-color-scheme: dark) {
                .read-aloud-mini-player {
                    background: rgba(30, 41, 59, 0.92);
                    border-color: rgba(255,255,255,0.08);
                    color: #f1f5f9;
                }
            }
            .read-aloud-mini-player.hidden {
                transform: translateY(20px);
                opacity: 0;
                pointer-events: none;
            }
            .read-aloud-mini-player .mini-sentence {
                flex: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-weight: 500;
                max-width: 160px;
            }
            .read-aloud-mini-player .mini-btn {
                background: none;
                border: none;
                cursor: pointer;
                color: #64748b;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 4px;
                border-radius: 8px;
                transition: all 0.2s;
            }
            .read-aloud-mini-player .mini-btn:hover {
                background: #f1f5f9;
                color: #10b981;
            }
            @media (prefers-color-scheme: dark) {
                .read-aloud-mini-player .mini-btn {
                    color: #94a3b8;
                }
                .read-aloud-mini-player .mini-btn:hover {
                    background: #334155;
                    color: #34d399;
                }
            }
            .read-aloud-mini-player .mini-close {
                position: absolute;
                top: -8px;
                right: -8px;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: #94a3b8;
                color: white;
                font-size: 14px;
                line-height: 1;
                text-align: center;
                cursor: pointer;
                border: none;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0;
            }
            .read-aloud-mini-player .mini-close:hover {
                background: #ef4444;
            }
            .read-aloud-mini-player .hidden {
                display: none;
            }
            @media (prefers-reduced-motion: reduce) {
                .read-aloud-mini-player {
                    transition: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(container);
    miniPlayer = container;
    miniPlayerVisible = true;

    // Event listeners
    container.querySelector('.mini-toggle').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'CMD_TOGGLE_PLAY' });
    });
    container.querySelector('.mini-next').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'CMD_NEXT' });
    });
    container.querySelector('.mini-stop').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'CMD_STOP' });
        hideMiniPlayer();
    });
    container.querySelector('.mini-close').addEventListener('click', () => {
        hideMiniPlayer();
    });
}

function hideMiniPlayer() {
    if (miniPlayer) {
        miniPlayer.classList.add('hidden');
        miniPlayerVisible = false;
    }
}

function updateMiniPlayer(state) {
    if (!state) return;

    const isPlaying = state.isPlaying && !state.isPaused;
    const hasContent = state.sentences && state.sentences.length > 0;

    if (!hasContent) {
        hideMiniPlayer();
        return;
    }

    // Show mini-player when playing or paused with content
    ensureMiniPlayer();

    const sentence = state.sentences[state.currentIndex] || '';
    const sentenceEl = miniPlayer.querySelector('.mini-sentence');
    if (sentenceEl && sentence !== currentSentenceText) {
        sentenceEl.textContent = sentence;
        currentSentenceText = sentence;
    }

    // Toggle play/pause icon
    const playIcon = miniPlayer.querySelector('.mini-icon-play');
    const pauseIcon = miniPlayer.querySelector('.mini-icon-pause');
    if (isPlaying) {
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
    } else {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
    }
}
