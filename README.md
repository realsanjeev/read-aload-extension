# Read Aloud Extension

A premium Text-to-Speech (TTS) Chrome Extension that automatically detects and reads the main content of any web page. Features a modern UI with real-time "Karaoke-style" sentence highlighting.

## Key Features

- **🧠 Intelligent Extraction**: Automatically detects the main article text on a page, filtering out ads and menus.
- **🎤 Real-Time Highlighting**: Highlights the current sentence in yellow as it is spoken (Karaoke mode).
- **🎛️ Complete Control**: Play, Pause, Stop, and skip sentences (Next/Previous).
- **🎨 Premium UI**: A clean, modern interface with a "Reader View".
- **⚙️ Customization**:
    - **Voice**: Choose from any available browser voice.
    - **Speed**: Adjust reading rate (0.5x - 3.0x).
    - **Pitch**: Fine-tune voice pitch.
    - **Persistence**: Settings are saved automatically.

## Installation

1.  Clone or download this repository.
2.  Open Chrome and go to `chrome://extensions`.
3.  Enable **Developer mode** (top right toggle).
4.  Click **Load unpacked**.
5.  Select the extension directory.

## Usage

1.  Navigate to any article or blog post.
2.  Values the **Read Aloud** extension icon.
3.  The extension will auto-extract the text and display it.
4.  Click **Play** to start reading.
    - Click **Next/Prev** to jump sentences.
    - Click **Settings** (gear icon) to change voice/speed.
    - Click any sentence in the text view to jump directly to it.

## Permissions

- **activeTab**: Required to interact with the current page and extract text.
- **scripting**: Used to inject the extraction logic into the page.
- **storage**: Used to save your voice and speed preferences.

### References:
- Icon based on: [Flaticon Megaphone](https://www.flaticon.com/free-icon/megaphone_9018879)