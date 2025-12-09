import { Memory } from './modules/memory.js';
import { AudioManager } from './modules/audio.js';
import { LLM } from './modules/llm.js';

// UI Elements
const app = document.getElementById('app');
const statusText = document.getElementById('status-text');
const micBtn = document.getElementById('mic-btn');

// State
let isInitialized = false;
let currentMemory = Memory.load();

// Audio Manager
const audio = new AudioManager();

// --- Event Handlers ---

// 1. Initialize (Unlock Audio Context)
function initialize() {
    if (isInitialized) return;
    
    // Resume audio context if it exists/needed (mostly for Web Audio API, less so for SpeechSynthesis but good practice)
    // audio.resume(); 
    
    isInitialized = true;
    micBtn.disabled = false;
    statusText.textContent = "Online. Tap Mic to Speak.";
    app.classList.add('state-idle');
    
    // Optional: AI greets user if memory exists
    if (currentMemory.summary && currentMemory.summary !== "New conversation started.") {
        processAIResponse("Hello again. I'm ready.", true); // Skip analysis for greeting, just speak
    }
}

// 2. User User Speech Input
micBtn.addEventListener('click', () => {
    if (audio.isSessionActive) {
        audio.stopListening();
        // Visual Reset
        micBtn.style.background = "";
        setState('idle');
        statusText.textContent = "Paused";
    } else {
        audio.startListening();
        // Visual Active
        micBtn.style.background = "rgba(0, 210, 255, 0.3)";
    }
});

// Audio Manager Callbacks
audio.onListenStart = () => {
    // If we are not currently processing or speaking, show listening
    if (!app.classList.contains('state-thinking') && !app.classList.contains('state-speaking')) {
        setState('listening');
        statusText.textContent = "Listening...";
    }
};

audio.onListenEnd = () => {
    // Managed by session loop mostly
};

audio.onResult = async (transcript) => {
    console.log("User said:", transcript);
    
    // Visual feedback we heard something
    setState('thinking');
    statusText.textContent = "Processing...";
    
    await handleInteraction(transcript);
};

audio.onSpeakStart = () => {
    setState('speaking');
    statusText.textContent = "Speaking...";
};

audio.onSpeakEnd = () => {
    // Return to listening state visually if session is active
    if (audio.isSessionActive) {
        setState('listening');
        statusText.textContent = "Listening...";
    } else {
        setState('idle');
        statusText.textContent = "Ready";
    }
};

// --- Core Logic ---

let isProcessing = false;

async function handleInteraction(userText) {
    if (isProcessing) {
        // Prevent concurrent processing to avoid memory race conditions
        console.log("Already processing, dropping input.");
        return;
    }
    isProcessing = true;

    try {
        // --- Step 1: Analysis & Memory ---
        statusText.textContent = "Analyzing & Memorizing...";
        
        // Retrieve latest memory
        currentMemory = Memory.load();
        
        const analysisResult = await LLM.analyzeAndMemorize(userText, currentMemory);
        
        // Update Local Storage
        const updatedMemory = analysisResult.updated_memory;
        Memory.save(updatedMemory);
        currentMemory = updatedMemory; // Sync local state

        // --- Step 2: Response Generation ---
        statusText.textContent = "Formulating Response...";
        
        const responseText = await LLM.generateResponse(
            userText, 
            updatedMemory, 
            analysisResult.response_strategy
        );

        // --- Step 3: Speak ---
        processAIResponse(responseText);

    } catch (e) {
        console.error("Interaction failed", e);
        statusText.textContent = "Error";
        setTimeout(() => setState('idle'), 2000);
    } finally {
        isProcessing = false;
    }
}

function processAIResponse(text, skipStateCheck = false) {
    if (!skipStateCheck) {
        // We are already in thinking state, transition handled by audio events
    }
    audio.speak(text);
}

function setState(state) {
    app.className = ''; // Clear all
    app.classList.add(`state-${state}`);
}

// Global click to init (first time only)
document.body.addEventListener('click', () => {
    if (!isInitialized) initialize();
}, { once: true });

// Debug
console.log("System Loaded. Memory:", currentMemory);