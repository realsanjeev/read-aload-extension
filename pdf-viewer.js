// pdf-viewer.js

const viewerUrl = "https://assets.lsdsoftware.com/read-aloud/pdf-viewer-2/web/readaloud.html?embedded";

// Register listener immediately
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "GET_PDF_TEXTS") {
        if (!window.viewerQueue) {
            sendResponse({ error: "Viewer not ready yet" });
            return false;
        }
        window.viewerQueue.send({ method: "getTexts", index: msg.index || 0, quietly: true })
            .then(res => sendResponse(res.value))
            .catch(err => sendResponse({ error: err.message }));
        return true; // Keep channel open
    }
    if (msg.type === "GET_PDF_INDEX") {
        if (!window.viewerQueue) {
            sendResponse({ error: "Viewer not ready yet" });
            return false;
        }
        window.viewerQueue.send({ method: "getCurrentIndex" })
            .then(res => sendResponse(res.value))
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }
});

document.addEventListener("DOMContentLoaded", async () => {
    const frame = document.getElementById("viewer-frame");
    frame.src = viewerUrl;

    try {
        // Wait for viewer to be ready
        const queue = await waitForViewer(frame.contentWindow, new URL(viewerUrl).origin);
        window.viewerQueue = queue;

        // Load the document
        const query = new URLSearchParams(location.search);
        const pdfUrl = query.get("url");

        if (pdfUrl) {
            const res = await fetch(pdfUrl);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const buffer = await res.arrayBuffer();
            await queue.send({ method: "loadDocument", buffer: buffer }, [buffer]);
        }
    } catch (err) {
        console.error("Failed to load PDF:", err);
        alert("Failed to load PDF: " + err.message);
    }
});

function waitForViewer(targetWindow, targetOrigin) {
    return new Promise(resolve => {
        const queue = new MessageQueue(targetWindow, targetOrigin, {
            viewerReady: () => resolve(queue)
        });
    });
}

function MessageQueue(targetWindow, targetOrigin, handlers) {
    const pending = {};

    window.addEventListener("message", event => {
        if (event.origin === targetOrigin && event.data) {
            if (handlers[event.data.method]) {
                handlers[event.data.method](event.data);
            } else if (event.data.id && pending[event.data.id]) {
                pending[event.data.id](event.data);
                delete pending[event.data.id];
            }
        }
    });

    this.send = function (message, transfer) {
        message.id = Math.random().toString(36).substr(2, 9);
        targetWindow.postMessage(message, targetOrigin, transfer);
        return new Promise((resolve, reject) => {
            pending[message.id] = resolve;
            // Timeout fallback?
            setTimeout(() => {
                if (pending[message.id]) {
                    delete pending[message.id];
                    reject(new Error("Timeout waiting for response"));
                }
            }, 10000);
        });
    }
}
