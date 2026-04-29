// offscreen.js - Text-to-Speech Engine

let playerState = {
    sentences: [],
    lineBreaks: [], // Indices in sentences array where a paragraph break should occur
    currentIndex: 0,
    isPlaying: false,
    isPaused: false,
    settings: {
        voiceName: null,
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0
    },
    utterance: null
};

let errorRetryCount = 0;

// Settings are initialized via CMD_INIT and CMD_UPDATE_SETTINGS messages from the popup

// Listen for messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'PING') {
        sendResponse({ type: 'PONG' });
        return;
    }

    let isAsync = false;
    switch (msg.type) {
        case 'CMD_INIT':
            console.log("Offscreen: CMD_INIT received, text length:", msg.text ? msg.text.length : 0);
            initPlayer(msg.text, msg.index || 0, msg.settings, false);
            sendResponse({ status: 'ok' });
            break;
        case 'CMD_PLAY':
            play();
            sendResponse({ status: 'ok' });
            break;
        case 'CMD_TOGGLE_PLAY':
            togglePlay();
            sendResponse({ status: 'ok' });
            break;
        case 'CMD_PAUSE':
            togglePause();
            sendResponse({ status: 'ok' });
            break;
        case 'CMD_STOP':
            stop();
            sendResponse({ status: 'ok' });
            break;
        case 'CMD_NEXT':
            next();
            sendResponse({ status: 'ok' });
            break;
        case 'CMD_PREV':
            prev();
            sendResponse({ status: 'ok' });
            break;
        case 'CMD_JUMP':
            initPlayer(null, msg.index, null, true);
            sendResponse({ status: 'ok' });
            break;
        case 'CMD_UPDATE_SETTINGS':
            updateSettings(msg.settings);
            sendResponse({ status: 'ok' });
            break;
        case 'CMD_TEST':
            testVoice();
            sendResponse({ status: 'ok' });
            break;
        case 'CMD_DETECT_LANG':
            detectLanguage(msg.text)
                .then(lang => sendResponse({ lang }))
                .catch(err => sendResponse({ error: err.message }));
            break;
        case 'CMD_GET_STATE':
            sendUpdate(sendResponse);
            break;
    }
    return true; // Always return true to keep the message channel open
});

/**
 * Initializes the player with new text.
 * Standardizes splitting to provide both sentences and visual breaks to the UI.
 */
function initPlayer(text, startIndex, settings = null, autoPlay = false) {
    window.speechSynthesis.cancel();
    
    if (settings) {
        playerState.settings = { ...playerState.settings, ...settings };
    }

    if (text) {
        const lines = text.split(/\n+/);
        playerState.sentences = [];
        playerState.lineBreaks = [];

        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine.length === 0) return;

            if (playerState.sentences.length > 0) {
                playerState.lineBreaks.push(playerState.sentences.length);
            }

            const sentenceRegex = /[^.!?]+[.!?]+["']?|[^.!?]+$/g;
            const lineSentences = trimmedLine.match(sentenceRegex) || [trimmedLine];
            playerState.sentences.push(...lineSentences.map(s => s.trim()).filter(s => s.length > 0));
        });
    }

    playerState.currentIndex = Math.min(startIndex, playerState.sentences.length - 1);
    if (playerState.currentIndex < 0) playerState.currentIndex = 0;
    
    playerState.isPlaying = autoPlay;
    playerState.isPaused = false;

    if (autoPlay) {
        speakCurrentSentence();
    } else {
        sendUpdate();
    }
}

function updateSettings(newSettings) {
    const oldRate = playerState.settings.rate;
    const oldVoice = playerState.settings.voiceName;
    playerState.settings = { ...playerState.settings, ...newSettings };
    
    if (playerState.isPlaying && !playerState.isPaused) {
        if (oldRate !== playerState.settings.rate || oldVoice !== playerState.settings.voiceName) {
            speakCurrentSentence();
        }
    }
}

function play() {
    if (playerState.sentences.length === 0) return;
    
    if (playerState.isPaused) {
        playerState.isPlaying = true;
        playerState.isPaused = false;
        window.speechSynthesis.resume();
        sendUpdate();
    } else {
        playerState.isPlaying = true;
        playerState.isPaused = false;
        speakCurrentSentence();
    }
}

function pause() {
    playerState.isPlaying = false;
    playerState.isPaused = true;
    window.speechSynthesis.pause();
    sendUpdate();
}

function togglePlay() {
    if (playerState.isPlaying && !playerState.isPaused) {
        pause();
    } else {
        play();
    }
}

function togglePause() {
    togglePlay();
}

function stop() {
    playerState.isPlaying = false;
    playerState.isPaused = false;
    playerState.currentIndex = 0;
    window.speechSynthesis.cancel();
    sendUpdate();
}

function next() {
    if (playerState.currentIndex < playerState.sentences.length - 1) {
        playerState.currentIndex++;
        if (playerState.isPlaying) speakCurrentSentence();
        else sendUpdate();
    }
}

function prev() {
    if (playerState.currentIndex > 0) {
        playerState.currentIndex--;
        if (playerState.isPlaying) speakCurrentSentence();
        else sendUpdate();
    }
}

function jump(index) {
    playerState.currentIndex = index;
    if (playerState.sentences.length > 0) {
        playerState.isPlaying = true;
        playerState.isPaused = false;
        speakCurrentSentence();
    }
}

function speakCurrentSentence() {
    if (playerState.utterance) {
        playerState.utterance.onend = null;
        playerState.utterance.onerror = null;
    }
    
    window.speechSynthesis.cancel();
    
    if (playerState.currentIndex >= playerState.sentences.length) {
        playerState.isPlaying = false;
        sendUpdate();
        return;
    }

    const text = playerState.sentences[playerState.currentIndex];
    const utter = new SpeechSynthesisUtterance(text);
    playerState.utterance = utter;

    utter.rate = playerState.settings.rate;
    utter.pitch = playerState.settings.pitch;
    utter.volume = playerState.settings.volume;

    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
        // Voices not loaded yet, wait a bit and retry
        console.warn("Offscreen: Voices not loaded yet, waiting...");
        setTimeout(speakCurrentSentence, 100);
        return;
    }

    if (playerState.settings.voiceName) {
        const v = voices.find(voice => voice.name === playerState.settings.voiceName);
        if (v) utter.voice = v;
    }

    utter.onstart = () => {
        errorRetryCount = 0;
        sendUpdate();
    };

    utter.onend = () => {
        if (playerState.isPlaying && !playerState.isPaused) {
            playerState.currentIndex++;
            if (playerState.currentIndex < playerState.sentences.length) {
                speakCurrentSentence();
            } else {
                stop();
            }
        }
    };

    utter.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
            console.error("TTS Error:", e.error);
            if (playerState.isPlaying) {
                errorRetryCount++;
                if (errorRetryCount > 3) {
                    playerState.currentIndex++;
                    errorRetryCount = 0;
                }
                setTimeout(speakCurrentSentence, 100);
            }
        }
    };

    setTimeout(() => {
        window.speechSynthesis.speak(utter);
    }, 50);
}

function sendUpdate(sendResponse = null) {
    const state = {
        isPlaying: playerState.isPlaying,
        isPaused: playerState.isPaused,
        currentIndex: playerState.currentIndex,
        totalSentences: playerState.sentences.length,
        sentences: playerState.sentences,
        lineBreaks: playerState.lineBreaks
    };

    if (sendResponse) {
        sendResponse({ type: 'UPDATE_UI', state });
    } else {
        chrome.runtime.sendMessage({ type: 'UPDATE_UI', state }, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
        });
    }
}

function testVoice() {
    const wasPlaying = playerState.isPlaying;
    const wasPaused = playerState.isPaused;
    const savedIndex = playerState.currentIndex;
    
    window.speechSynthesis.cancel();
    
    const text = "This is a test of your selected voice.";
    const utter = new SpeechSynthesisUtterance(text);
    playerState.utterance = utter;

    utter.rate = playerState.settings.rate;
    utter.pitch = playerState.settings.pitch;
    utter.volume = playerState.settings.volume;

    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
        console.warn("Offscreen: Voices not loaded for test, waiting...");
        setTimeout(testVoice, 100);
        return;
    }

    if (playerState.settings.voiceName) {
        const v = voices.find(voice => voice.name === playerState.settings.voiceName);
        if (v) utter.voice = v;
    }

    const restoreState = () => {
        if (wasPlaying && !wasPaused) {
            playerState.currentIndex = savedIndex;
            playerState.isPlaying = true;
            playerState.isPaused = false;
            speakCurrentSentence();
        } else {
            sendUpdate();
        }
    };

    utter.onend = restoreState;
    utter.onerror = restoreState;
    setTimeout(() => {
        window.speechSynthesis.speak(utter);
    }, 50);
}

// --- Language Detection remains same (using external iframe for now) ---
// [Language detection code follows...]

// --- FastText Language Detection ---

let fasttextFrame = null;
let fasttextPending = {};
let isFasttextReady = false;
let fasttextQueue = [];

function getFasttextFrame() {
    if (!fasttextFrame) {
        fasttextFrame = document.createElement('iframe');
        fasttextFrame.src = 'https://ttstool.com/fasttext/index.html';
        fasttextFrame.style.display = 'none';
        
        fasttextFrame.onload = () => {
            isFasttextReady = true;
            fasttextQueue.forEach(req => fasttextFrame.contentWindow.postMessage(req, '*'));
            fasttextQueue = [];
        };

        fasttextFrame.onerror = () => {
            fasttextQueue = [];
            for (let id in fasttextPending) {
                fasttextPending[id].reject(new Error("FastText frame failed to load"));
                delete fasttextPending[id];
            }
        };

        document.body.appendChild(fasttextFrame);

        window.addEventListener('message', e => {
            if (e.origin !== 'https://ttstool.com') return;
            if (e.source === fasttextFrame.contentWindow) {
                handleFasttextMessage(e.data);
            }
        });
    }
    return fasttextFrame;
}

function handleFasttextMessage(msg) {
    if (msg.type === 'response' && msg.id && fasttextPending[msg.id]) {
        if (msg.error) fasttextPending[msg.id].reject(new Error(msg.error));
        else fasttextPending[msg.id].resolve(msg.result);
        delete fasttextPending[msg.id];
    }
}

function detectLanguage(text) {
    const frame = getFasttextFrame();
    const id = Math.random().toString(36).substr(2);

    return new Promise((resolve, reject) => {
        let timeoutId;
        
        fasttextPending[id] = { 
            resolve: (val) => { clearTimeout(timeoutId); resolve(val); }, 
            reject: (err) => { clearTimeout(timeoutId); reject(err); } 
        };

        const request = {
            from: "fasttext-host",
            to: "fasttext-service",
            type: "request",
            id: id,
            method: "detectLanguage",
            args: [text]
        };

        if (isFasttextReady && frame.contentWindow) {
            frame.contentWindow.postMessage(request, '*');
        } else {
            fasttextQueue.push(request);
        }
            
        timeoutId = setTimeout(() => {
            if (fasttextPending[id]) {
                delete fasttextPending[id];
                reject(new Error("FastText timeout"));
            }
        }, 5000);
    });
}

