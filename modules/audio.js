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
        
        // Echo Cancellation
        this.recentSpokenText = "";
        this.speakEndTime = 0;
        
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
            let interimTranscript = '';
            let finalTranscript = '';

            // Combine results to handle continuous stream
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            const currentInput = (finalTranscript || interimTranscript).trim();
            if (!currentInput) return;

            // --- 1. Interruption Logic (Works on Interim & Final) ---
            if (this.synthesis.speaking) {
                // If we detect non-echo speech while speaking, stop immediately
                // We check interim results too for faster reaction
                if (!this._isEcho(currentInput, this.recentSpokenText)) {
                    console.log("Interruption detected:", currentInput);
                    this.stopSpeaking();
                }
            }

            // --- 2. Processing Logic (Only Final Results) ---
            if (finalTranscript.trim()) {
                // Re-check echo in case we just stopped speaking
                // We use a small buffer time after speaking stops to still catch lingering echoes
                const timeSinceSpeak = Date.now() - this.speakEndTime;
                const wasRecentlySpeaking = timeSinceSpeak < 1500 || this.synthesis.speaking;

                if (wasRecentlySpeaking) {
                    if (this._isEcho(finalTranscript, this.recentSpokenText)) {
                        console.warn("Ignored echo:", finalTranscript);
                        return;
                    }
                }

                if (this.onResult) this.onResult(finalTranscript.trim());
            }
        };

        this.recognition.onerror = (event) => {
            // Ignore no-speech errors which happen frequently in continuous mode
            if (event.error !== 'no-speech') {
                console.warn("Speech recognition warning/error", event.error);
            }
        };
    }

    /**
     * Determines if input is likely an echo of output.
     * Checks if the input is a substring or subset of the output.
     */
    _isEcho(input, output) {
        if (!output || !input) return false;
        
        // Normalize: lowercase, remove punctuation, collapse spaces
        const normalize = (str) => str.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
        
        const normInput = normalize(input);
        const normOutput = normalize(output);
        
        if (!normInput) return false;

        // Strategy 1: Substring Check (Primary)
        // If the microphone hears exactly what the AI is saying (or a fragment of it), it's an echo.
        if (normOutput.includes(normInput)) return true;

        // Strategy 2: Word Subset Check (Secondary)
        // Handles cases where mic picks up "word1 ... word2" with skips (poor mic quality / gating)
        const inWords = normInput.split(' ');
        const outWords = new Set(normOutput.split(' '));
        
        // If every significant word in the input exists in the output, treat as echo.
        // This is aggressive but necessary to prevent self-conversation loops.
        // E.g. AI: "I like cats" -> User: "cats" (Echo) -> User: "dogs" (Interruption)
        const allWordsPresent = inWords.every(word => {
            // Allow very short words to bypass if they are the ONLY mismatch, 
            // but generally if all words match, it's an echo.
            return outWords.has(word);
        });

        return allWordsPresent;
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
        this.recentSpokenText = text; // Track for echo cancellation

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
            if (this.onSpeakStart) this.onSpeakStart();
        };

        utterance.onend = () => {
            this.currentSpokenText = ""; 
            this.speakEndTime = Date.now(); // Mark end time for echo buffer
            if (this.onSpeakEnd) this.onSpeakEnd();
        };

        utterance.onerror = (e) => {
            console.error("TTS Error", e);
            this.currentSpokenText = "";
            this.speakEndTime = Date.now();
            if (this.onSpeakEnd) this.onSpeakEnd();
        };

        this.synthesis.speak(utterance);
    }
}