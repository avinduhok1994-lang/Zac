import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateIcebreaker(topic: string, type: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an icebreaker assistant for a social voice app called Zac. 
      The user is about to start a conversation about: "${topic}" (Type: ${type}).
      Generate 3 short, engaging icebreaker questions or prompts to help them start the conversation.
      Return them as a JSON array of strings.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Error generating icebreaker:", error);
    return ["Hi! How are you?", "What's on your mind?", "Tell me more about your topic!"];
  }
}

export async function moderateMessage(content: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following message for toxicity, harassment, or inappropriate content in the context of a social voice app. 
      Return a JSON object with:
      - "isSafe": boolean
      - "reason": string (optional, if unsafe)
      
      Message: "${content}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isSafe: { type: Type.BOOLEAN },
            reason: { type: Type.STRING }
          },
          required: ["isSafe"]
        }
      }
    });
    return JSON.parse(response.text || '{"isSafe": true}');
  } catch (error) {
    console.error("Error moderating message:", error);
    return { isSafe: true };
  }
}

export async function summarizeConversation(messages: { sender: string, text: string }[]) {
  try {
    const chatHistory = messages.map(m => `${m.sender}: ${m.text}`).join("\n");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Summarize the following conversation in 2-3 sentences, focusing on the main topics discussed and the overall vibe.
      
      Conversation:
      ${chatHistory}`,
    });
    return response.text;
  } catch (error) {
    console.error("Error summarizing conversation:", error);
    return "A great conversation was had!";
  }
}
