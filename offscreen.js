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
        case 'CMD_PAUSE':
            pause();
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
        case 'CMD_GET_STATE':
            // Send current state back to popup (useful when reopening popup)
            sendUpdate();
            break;
    }
});

function initPlayer(text, startIndex) {
    // Basic sentence splitting (same logic as before)
    const sentenceRegex = /[^.!?]+[.!?]+["']?|[^.!?]+$/g;
    const rawSentences = text.match(sentenceRegex) || [text];
    playerState.sentences = rawSentences.map(s => s.trim()).filter(s => s.length > 0);

    playerState.currentIndex = startIndex;
    stop(); // Reset checks

    // Auto-play on init
    play();
}

function updateSettings(newSettings) {
    playerState.settings = { ...playerState.settings, ...newSettings };
    // If playing, restart current sentence to apply settings immediately? 
    // Or just apply to next. Let's restart for better UX.
    if (playerState.isPlaying && !playerState.isPaused) {
        window.speechSynthesis.cancel();
        speakCurrentSentence();
    }
}

function play() {
    if (playerState.sentences.length === 0) return;

    playerState.isPlaying = true;
    playerState.isPaused = false;

    // Resume or Start
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
    window.speechSynthesis.pause(); // Standard pause is better for "resume"
    // However, for granular control (prev/next), cancel is safer. 
    // We'll stick to cancel() logic for robustness in this phase
    window.speechSynthesis.cancel();
    sendUpdate();
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

    utter.onstart = () => {
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
            // Auto-skip
            if (playerState.isPlaying) {
                playerState.currentIndex++;
                speakCurrentSentence();
            }
        }
    };

    window.speechSynthesis.speak(utter);
}

function sendUpdate() {
    // Broadcast state to any open popup
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
