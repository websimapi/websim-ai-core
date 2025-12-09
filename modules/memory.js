/**
 * Memory Manager for handling LocalStorage persistence.
 * Uses a compressed JSON format to store conversation context.
 */

const STORAGE_KEY = 'ai_core_memory_v1';

const DEFAULT_MEMORY = {
    summary: "New conversation started.",
    facts: [],
    last_interaction: null,
    topic_history: []
};

export const Memory = {
    /**
     * Load memory from local storage
     * @returns {Object} Memory object
     */
    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                return JSON.parse(raw);
            }
        } catch (e) {
            console.error("Failed to load memory", e);
        }
        return JSON.parse(JSON.stringify(DEFAULT_MEMORY));
    },

    /**
     * Save memory to local storage
     * @param {Object} memoryData 
     */
    save(memoryData) {
        try {
            memoryData.last_interaction = Date.now();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryData));
            console.log("Memory saved:", memoryData);
        } catch (e) {
            console.error("Failed to save memory", e);
        }
    },

    /**
     * Reset memory (debug/utility)
     */
    clear() {
        localStorage.removeItem(STORAGE_KEY);
    },

    /**
     * Format memory for LLM context
     */
    getPromptContext(memory) {
        return `
CURRENT MEMORY STATE:
Summary: ${memory.summary}
Key Facts: ${memory.facts.join("; ")}
Recent Topics: ${memory.topic_history.slice(-3).join(", ")}
        `.trim();
    }
};