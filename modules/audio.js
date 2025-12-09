/**
 * Audio Manager for Speech Recognition (STT) and Synthesis (TTS).
 */

export class AudioManager {
    constructor() {
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        this.isSessionActive = false; // User toggled state
        this.currentSpokenText = ""; // To detect echo
        
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
        this.recognition.continuous = true; // Keep listening
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isListening = true;
            if (this.onListenStart) this.onListenStart();
        };

        this.recognition.onend = () => {
            this.isListening = false;
            // Auto-restart if session is active and we didn't explicitly stop it
            if (this.isSessionActive) {
                setTimeout(() => {
                    if (this.isSessionActive && !this.isListening) this.startListening();
                }, 100);
            } else {
                if (this.onListenEnd) this.onListenEnd();
            }
        };

        this.recognition.onresult = (event) => {
            // Get the latest result
            const resultIndex = event.results.length - 1;
            const result = event.results[resultIndex];
            const transcript = result[0].transcript.trim();
            const isFinal = result.isFinal;

            if (transcript.length > 0) {
                // Normalize strings for comparison (remove punctuation, lowercase)
                const normalize = (str) => str.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');

                // Check for Interruption: If TTS is speaking
                if (this.synthesis.speaking) {
                    const cleanTranscript = normalize(transcript);
                    const cleanSpeech = normalize(this.currentSpokenText);
                    
                    // Echo Cancellation: If the input is a subset of what we are currently saying, ignore it.
                    if (cleanSpeech.includes(cleanTranscript) && cleanSpeech.length > 0) {
                        return; // Ignore echo
                    }
                    
                    // If it's distinct (not found in current speech), it's an interruption
                    console.log("Interruption detected:", transcript);
                    this.stopSpeaking(); 
                }

                // Only emit result if it is Final
                if (isFinal) {
                    if (this.onResult) this.onResult(transcript);
                }
            }
        };

        this.recognition.onerror = (event) => {
            // Ignore no-speech errors which happen frequently in continuous mode
            if (event.error !== 'no-speech') {
                console.warn("Speech recognition warning/error", event.error);
            }
        };
    }

    startListening() {
        if (!this.recognition) return;
        this.isSessionActive = true;
        try {
            this.recognition.start();
        } catch (e) {
            // Already started, ignore
        }
    }

    stopListening() {
        this.isSessionActive = false;
        if (!this.recognition) return;
        this.recognition.stop();
        this.stopSpeaking();
    }

    stopSpeaking() {
        if (this.synthesis.speaking) {
            this.synthesis.cancel();
        }
    }

    speak(text) {
        this.stopSpeaking();
        this.currentSpokenText = text;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
            if (this.onSpeakStart) this.onSpeakStart();
        };

        utterance.onend = () => {
            this.currentSpokenText = ""; // Clear text
            if (this.onSpeakEnd) this.onSpeakEnd();
        };

        utterance.onerror = (e) => {
            console.error("TTS Error", e);
            this.currentSpokenText = "";
            if (this.onSpeakEnd) this.onSpeakEnd();
        };

        this.synthesis.speak(utterance);
    }
}