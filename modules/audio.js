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
        this.recognition.interimResults = false;
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
            const transcript = event.results[resultIndex][0].transcript.trim();
            const isFinal = event.results[resultIndex].isFinal;

            if (transcript.length > 0) {
                // INTELLIGENT ECHO CANCELLATION
                const now = Date.now();
                const isSpeaking = this.synthesis.speaking;
                
                // Check for echo if the AI is speaking OR if it recently stopped (within 1.5s)
                // This buffer handles audio latency, room reverb, and processing delays
                const isEchoCheckPeriod = isSpeaking || (now - this.speakEndTime < 1500);

                if (isEchoCheckPeriod) {
                    // Check if the input is likely just the AI hearing itself
                    if (this._isEcho(transcript, this.recentSpokenText)) {
                        console.warn("Echo detected & ignored:", transcript);
                        return; // Ignore this input
                    }
                    
                    // If it's NOT an echo, but we are speaking, it's a valid interruption
                    if (isSpeaking) {
                        console.log("Interruption detected:", transcript);
                        this.stopSpeaking(); 
                    }
                }

                if (this.onResult) this.onResult(transcript);
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
     * Uses fuzzy word overlap.
     */
    _isEcho(input, output) {
        if (!output || !input) return false;
        
        const normInput = input.toLowerCase().replace(/[^\w\s]/g, '');
        const normOutput = output.toLowerCase().replace(/[^\w\s]/g, '');
        
        // 1. Direct inclusion
        if (normOutput.includes(normInput)) return true;

        // 2. Word Set Overlap (Jaccard-ish)
        const inWords = normInput.split(/\s+/).filter(w => w);
        const outWords = new Set(normOutput.split(/\s+/));
        
        if (inWords.length === 0) return false;

        let matchCount = 0;
        for (const w of inWords) {
            if (outWords.has(w)) matchCount++;
        }
        
        // If more than 50% of input words were just spoken by AI, assume echo
        return (matchCount / inWords.length) > 0.5;
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