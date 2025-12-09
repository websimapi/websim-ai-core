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
                // Check if the current input is just an echo of what we are saying
                const isEcho = this._isEcho(currentInput, this.recentSpokenText);
                
                if (!isEcho) {
                    // It's not an echo, so it must be the user interrupting
                    console.log("Interruption detected! User said:", currentInput);
                    this.stopSpeaking();
                    // We keep listening. The final result will trigger the processing logic in onresult loop.
                } else {
                    // It's an echo, ignore it.
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

        // Strategy: Strict Word Subset Check
        // If ALL words in the input ARE in the output, it is likely an echo (microphone hearing the speaker).
        // If ANY word in the input is NOT in the output, it is likely the user saying something new (interruption).
        
        const inWords = normInput.split(' ');
        const outWords = new Set(normOutput.split(' '));
        
        // Check for words that shouldn't be there (foreign words)
        const foreignWords = inWords.filter(word => !outWords.has(word));

        // If we found words that are not in the AI's speech, it's the user.
        if (foreignWords.length > 0) {
            return false; // Not an echo (User is speaking)
        }

        // If all words matched, it's an echo.
        return true;
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
        if (this.synthesis.speaking || this.currentSpokenText) {
            this.synthesis.cancel();
            // Ensure state cleanup happens immediately as onend might not fire reliably on cancel
            this.currentSpokenText = "";
            this.speakEndTime = Date.now();
            if (this.onSpeakEnd) this.onSpeakEnd();
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