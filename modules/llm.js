/**
 * LLM Interface for multi-step processing.
 * 1. Analysis & Memory Update
 * 2. Response Generation
 */

import { Memory } from './memory.js';

// Enforcing the 4-second throttle rule
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 4000; // 4 seconds

async function throttle() {
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    if (timeSinceLast < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLast;
        console.log(`Throttling request for ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    lastRequestTime = Date.now();
}

export const LLM = {
    /**
     * Step 1: Analyze user input and update memory.
     * Returns JSON instructions for client.
     */
    async analyzeAndMemorize(userText, currentMemory) {
        await throttle();

        const memoryContext = Memory.getPromptContext(currentMemory);
        
        const systemPrompt = `
You are the Memory Core of an AI assistant.
Your goal: Analyze the user's input to update the long-term compressed memory and decide the direction of the response.

CURRENT MEMORY:
${JSON.stringify(currentMemory)}

USER INPUT: "${userText}"

INSTRUCTIONS:
1. PRESERVE INFORMATION: Do not delete existing facts or summary details unless they are explicitly contradicted by the user.
2. MERGE: Combine the "current memory" summary with the new interaction to create a comprehensive updated summary.
3. FACTS: Keep old facts. Append new facts only if significant.
4. RESPONSE STRATEGY: Provide a distinct instruction for how the AI should reply.

Respond strictly with this JSON schema:
{
  "updated_memory": {
    "summary": "string (The comprehensive history of the user and AI relationship, merging old and new)",
    "facts": ["string" (All valid facts, old + new)],
    "topic_history": ["string" (Last 5 topics)]
  },
  "response_strategy": "string (instruction for the responder personality)"
}
        `.trim();

        try {
            const completion = await websim.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "Analyze input." }
                ],
                json: true
            });
            
            return JSON.parse(completion.content);
        } catch (e) {
            console.error("LLM Analysis Error", e);
            // Fallback
            return {
                updated_memory: currentMemory,
                response_strategy: "Respond politely indicating a slight processing error but continue conversation."
            };
        }
    },

    /**
     * Step 2: Generate the spoken response.
     */
    async generateResponse(userText, memoryContext, strategy) {
        await throttle();

        const systemPrompt = `
You are a helpful, concise, and intelligent AI assistant.
You are talking via voice, so keep your responses conversational, not too long, and easy to speak.

CONTEXT FROM MEMORY:
${JSON.stringify(memoryContext)}

STRATEGY INSTRUCTION:
${strategy}

Generate a response to the user's input: "${userText}"
        `.trim();

        try {
            const completion = await websim.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userText }
                ]
            });
            return completion.content;
        } catch (e) {
            console.error("LLM Response Error", e);
            return "I'm having trouble formulating a response right now.";
        }
    }
};