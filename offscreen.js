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

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
        case 'CMD_INIT':
            initPlayer(msg.text, msg.index || 0);
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
        case 'CMD_GET_STATE':
            sendUpdate();
            break;
    }
});

function initPlayer(text, startIndex) {
    const sentenceRegex = /[^.!?]+[.!?]+["']?|[^.!?]+$/g;
    const rawSentences = text.match(sentenceRegex) || [text];
    playerState.sentences = rawSentences.map(s => s.trim()).filter(s => s.length > 0);
    playerState.currentIndex = startIndex;
    stop();
    play();
}

function updateSettings(newSettings) {
    playerState.settings = { ...playerState.settings, ...newSettings };
    if (playerState.isPlaying && !playerState.isPaused) {
        window.speechSynthesis.cancel();
        speakCurrentSentence();
    }
}

function play() {
    if (playerState.sentences.length === 0) return;
    playerState.isPlaying = true;
    playerState.isPaused = false;
    if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
    } else {
        speakCurrentSentence();
    }
    sendUpdate();
}

function pause() {
    playerState.isPlaying = false;
    playerState.isPaused = true;
    window.speechSynthesis.cancel();
    sendUpdate();
}

function togglePlay() {
    if (playerState.isPlaying) {
        stop();
    } else {
        play();
    }
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
        fasttextPending[id] = { resolve, reject };

        const request = {
            from: "fasttext-host",
            to: "fasttext-service",
            type: "request",
            id: id,
            method: "detectLanguage",
            args: [text]
        };

        if (!frame.contentWindow) {
            reject(new Error("FastText frame not ready"));
            return;
        }

        // Give the iframe a moment to load if just created
        setTimeout(() => {
            frame.contentWindow.postMessage(request, '*');
        }, 500);

        setTimeout(() => {
            if (fasttextPending[id]) {
                delete fasttextPending[id];
                reject(new Error("FastText timeout"));
            }
        }, 5000);
    });
}

// Handler for CMD_DETECT_LANG
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'CMD_DETECT_LANG') {
        detectLanguage(msg.text)
            .then(lang => sendResponse({ lang }))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }
});
