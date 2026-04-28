// offscreen.js
// This script runs in a hidden document and handles the actual speech synthesis.

let playerState = {
    sentences: [],
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

// Initialize settings from storage
chrome.storage.sync.get(['voiceName', 'rate', 'pitch', 'volume'], (data) => {
    if (data) {
        playerState.settings.voiceName = data.voiceName || null;
        playerState.settings.rate = parseFloat(data.rate) || 1.0;
        playerState.settings.pitch = parseFloat(data.pitch) || 1.0;
        playerState.settings.volume = parseFloat(data.volume) || 1.0;
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    let isAsync = false;
    switch (msg.type) {
        case 'CMD_INIT':
            initPlayer(msg.text, msg.index || 0, msg.sentences, msg.settings);
            break;
        case 'CMD_PLAY':
            play();
            break;
        case 'CMD_TOGGLE_PLAY':
            togglePlay();
            break;
        case 'CMD_PAUSE':
            togglePause();
            break;
        case 'CMD_STOP':
            stop();
            break;
        case 'CMD_NEXT':
            next();
            break;
        case 'CMD_PREV':
            prev();
            break;
        case 'CMD_JUMP':
            jump(msg.index);
            break;
        case 'CMD_UPDATE_SETTINGS':
            updateSettings(msg.settings);
            break;
        case 'CMD_TEST':
            testVoice();
            break;
        case 'CMD_DETECT_LANG':
            isAsync = true;
            detectLanguage(msg.text)
                .then(lang => sendResponse({ lang }))
                .catch(err => sendResponse({ error: err.message }));
            break;
        case 'CMD_GET_STATE':
            const state = {
                isPlaying: playerState.isPlaying,
                isPaused: playerState.isPaused,
                currentIndex: playerState.currentIndex,
                totalSentences: playerState.sentences.length
            };
            if (sendResponse) sendResponse({ type: 'UPDATE_UI', state });
            sendUpdate();
            break;
    }
    if (isAsync) return true;
});

function initPlayer(text, startIndex, sentences = null, settings = null) {
    // 1. Cancel current playback but don't reset state yet
    window.speechSynthesis.cancel();
    
    // 2. Load settings if provided
    if (settings) {
        playerState.settings = { ...playerState.settings, ...settings };
    }
    
    // 3. Load sentences
    if (sentences && Array.isArray(sentences)) {
        playerState.sentences = sentences;
    } else if (text) {
        const sentenceRegex = /[^.!?]+[.!?]+["']?|[^.!?]+$/g;
        const rawSentences = text.match(sentenceRegex) || [text];
        playerState.sentences = rawSentences.map(s => s.trim()).filter(s => s.length > 0);
    }

    // 3. Set the start position
    playerState.currentIndex = startIndex;
    playerState.isPlaying = true;
    playerState.isPaused = false;

    // 4. Start speaking
    speakCurrentSentence();
}

function updateSettings(newSettings) {
    const oldRate = playerState.settings.rate;
    const oldVoice = playerState.settings.voiceName;
    playerState.settings = { ...playerState.settings, ...newSettings };
    
    // Only restart if playing and something that affects playback (like rate/voice) changed
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
        sendUpdate();
    }
}

function pause() {
    playerState.isPlaying = false;
    playerState.isPaused = true;
    window.speechSynthesis.pause();
    sendUpdate();
}

function togglePlay() {
    togglePause();
}

function togglePause() {
    if (playerState.isPlaying) {
        pause();
    } else {
        play();
    }
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
        window.speechSynthesis.cancel();
        if (playerState.isPlaying) speakCurrentSentence();
        else {
            playerState.isPaused = false;
            sendUpdate();
        }
    }
}

function prev() {
    if (playerState.currentIndex > 0) {
        playerState.currentIndex--;
        window.speechSynthesis.cancel();
        if (playerState.isPlaying) speakCurrentSentence();
        else {
            playerState.isPaused = false;
            sendUpdate();
        }
    }
}

function jump(index) {
    window.speechSynthesis.cancel();
    playerState.currentIndex = index;
    if (playerState.sentences.length > 0) {
        playerState.isPlaying = true;
        playerState.isPaused = false;
        speakCurrentSentence();
    }
}

function speakCurrentSentence() {
    window.speechSynthesis.cancel();
    if (playerState.currentIndex >= playerState.sentences.length) {
        playerState.isPlaying = false;
        sendUpdate();
        return;
    }

    const text = playerState.sentences[playerState.currentIndex];
    const utter = new SpeechSynthesisUtterance(text);

    utter.rate = playerState.settings.rate;
    utter.pitch = playerState.settings.pitch;
    utter.volume = playerState.settings.volume;

    const voices = window.speechSynthesis.getVoices();
    if (playerState.settings.voiceName) {
        const v = voices.find(voice => voice.name === playerState.settings.voiceName);
        if (v) utter.voice = v;
    }

    utter.onstart = () => sendUpdate();

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
            if (playerState.isPlaying) {
                playerState.currentIndex++;
                speakCurrentSentence();
            }
        }
    };

    window.speechSynthesis.speak(utter);
}

// Ensure voices are loaded
if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
        console.log("Offscreen: Voices loaded.");
    };
}

function sendUpdate() {
    chrome.runtime.sendMessage({
        type: 'UPDATE_UI',
        state: {
            isPlaying: playerState.isPlaying,
            isPaused: playerState.isPaused,
            currentIndex: playerState.currentIndex,
            totalSentences: playerState.sentences.length
        }
    });
}

function testVoice() {
    const wasPlaying = playerState.isPlaying;
    const wasPaused = playerState.isPaused;
    const savedIndex = playerState.currentIndex;
    
    window.speechSynthesis.cancel();
    // Test logic: speak sample, don't mess with playback state
    const text = "Hi! You are currently testing the settings in the Read Aloud extension. Thank you for using our service. If you like it, please consider giving us a 5-star rating.";
    const utter = new SpeechSynthesisUtterance(text);

    utter.rate = playerState.settings.rate;
    utter.pitch = playerState.settings.pitch;
    utter.volume = playerState.settings.volume;

    const voices = window.speechSynthesis.getVoices();
    if (playerState.settings.voiceName) {
        const v = voices.find(voice => voice.name === playerState.settings.voiceName);
        if (v) utter.voice = v;
    }

    utter.onend = () => {
        if (wasPlaying && !wasPaused) {
            playerState.currentIndex = savedIndex;
            playerState.isPlaying = true;
            playerState.isPaused = false;
            speakCurrentSentence();
        } else if (wasPaused) {
            playerState.currentIndex = savedIndex;
            playerState.isPlaying = false;
            playerState.isPaused = true;
            sendUpdate();
        }
    };

    window.speechSynthesis.speak(utter);
}

// --- FastText Language Detection ---

let fasttextFrame = null;
let fasttextPending = {};

function getFasttextFrame() {
    if (!fasttextFrame) {
        fasttextFrame = document.createElement('iframe');
        fasttextFrame.src = 'https://ttstool.com/fasttext/index.html';
        fasttextFrame.style.display = 'none';
        document.body.appendChild(fasttextFrame);

        window.addEventListener('message', e => {
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

        if (!frame.contentWindow) {
            delete fasttextPending[id];
            reject(new Error("FastText frame not ready"));
            return;
        }

        // Give the iframe a moment to load if just created
        setTimeout(() => {
            frame.contentWindow.postMessage(request, '*');
            
            timeoutId = setTimeout(() => {
                if (fasttextPending[id]) {
                    delete fasttextPending[id];
                    reject(new Error("FastText timeout"));
                }
            }, 5000);
        }, 500);
    });
}

