/**
 * Audio Manager for Speech Recognition (STT) and Synthesis (TTS).
 */

export class AudioManager {
    constructor() {
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        
        // Event callbacks
        this.onResult = null;
        this.onListenStart = null;
        this.onListenEnd = null;
        this.onSpeakStart = null;
        this.onSpeakEnd = null;

        this._initRecognition();
    }

    _initRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error("Speech Recognition API not supported in this browser.");
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false; // Stop after one sentence/phrase
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isListening = true;
            if (this.onListenStart) this.onListenStart();
        };

        this.recognition.onend = () => {
            this.isListening = false;
            if (this.onListenEnd) this.onListenEnd();
        };

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (this.onResult) this.onResult(transcript);
        };

        this.recognition.onerror = (event) => {
            console.error("Speech recognition error", event.error);
            this.isListening = false;
            if (this.onListenEnd) this.onListenEnd();
        };
    }

    startListening() {
        if (!this.recognition) return;
        try {
            this.recognition.start();
        } catch (e) {
            console.warn("Recognition already started or error", e);
        }
    }

    stopListening() {
        if (!this.recognition) return;
        this.recognition.stop();
    }

    speak(text) {
        if (this.synthesis.speaking) {
            this.synthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
            if (this.onSpeakStart) this.onSpeakStart();
        };

        utterance.onend = () => {
            if (this.onSpeakEnd) this.onSpeakEnd();
        };

        utterance.onerror = (e) => {
            console.error("TTS Error", e);
            if (this.onSpeakEnd) this.onSpeakEnd();
        };

        this.synthesis.speak(utterance);
    }
}