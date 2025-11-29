import { GoogleGenAI, Type } from "@google/genai";
import { JewelryAnalysis } from "../types";

// Helper to remove data URL prefix for API calls
const stripBase64Prefix = (base64: string) => {
  return base64.split(',')[1] || base64;
};

const getMimeType = (base64: string) => {
  return base64.substring(base64.indexOf(':') + 1, base64.indexOf(';'));
};

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please select a valid API key.");
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeJewelryImage = async (base64Image: string): Promise<JewelryAnalysis> => {
  const ai = getClient();
  
  const prompt = `
    Analyze this jewelry image. 
    1. Classify it into one of these categories: Ring, Earring, Necklace, Bracelet, Bangle, Pendant, Other.
    2. Determine its style (e.g., Indian Traditional, Western Modern).
    3. Write a brief visual description highlighting materials (gold, silver, diamonds, etc.).
    4. Recommend the best model attire (Indian Traditional vs Western) based on the jewelry style.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: {
      parts: [
        { inlineData: { mimeType: getMimeType(base64Image), data: stripBase64Prefix(base64Image) } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING, enum: ['Ring', 'Earring', 'Necklace', 'Bracelet', 'Bangle', 'Pendant', 'Other'] },
          style: { type: Type.STRING },
          description: { type: Type.STRING },
          recommendedAttire: { type: Type.STRING, enum: ['Indian Traditional', 'Western Formal', 'Western Casual', 'Evening Gown'] }
        },
        required: ["category", "style", "description", "recommendedAttire"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Failed to analyze image");
  return JSON.parse(text) as JewelryAnalysis;
};

// Retry helper for 429 errors
// Increased delay and retries for stability
const retryWithBackoff = async <T>(fn: () => Promise<T>, retries = 5, initialDelay = 4000): Promise<T> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      // Check for 429 or resource exhausted
      const isQuotaError = error?.status === 429 || error?.code === 429 || error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED');
      
      if (isQuotaError && i < retries - 1) {
        // Exponential backoff with jitter
        const delay = initialDelay * Math.pow(2, i) + Math.random() * 1000;
        console.warn(`Quota exceeded (429), retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
};

export const generateJewelryRendition = async (
  jewelryBase64: string,
  logoBase64: string,
  analysis: JewelryAnalysis,
  scenarioPrompt: string,
  jewelrySize?: string
): Promise<string> => {
  const ai = getClient();

  // Construct a detailed prompt combining analysis and scenario
  // Enhanced for realism using photographic terms and strictly enforcing scale
  const fullPrompt = `
    You are a world-class professional jewelry photographer using a Hasselblad H6D-100c.
    
    Subject Analysis:
    - Item: ${analysis.description}
    - Category: ${analysis.category}
    - Style: ${analysis.style}
    ${jewelrySize ? `- PHYSICAL SIZE: ${jewelrySize} (CRITICAL: Respect this scale)` : ''}

    Assignment:
    Create a hyper-realistic, 2K resolution commercial photograph of this jewelry item based on the following direction:
    "${scenarioPrompt}"

    Technical Requirements:
    - Focus: Razor sharp on the main gemstone or metalwork. 
    - Lighting: Professional studio lighting, softboxes, rim lighting to accentuate curves.
    - Realism: Natural reflections, realistic metal textures, correct refractive index for gems. No CGI look, no plastic textures.
    - Camera: Shot on 100mm macro lens, depth of field f/16 for product clarity.
    
    Scale Enforcement:
    ${jewelrySize ? `The jewelry MUST appear to be exactly ${jewelrySize} in physical size relative to the environment or model. Do not hallucinate a giant or tiny version. If on a model, it must fit human proportions accurately.` : 'Maintain realistic scaling relative to a standard human size.'}

    Compositing Instructions:
    1. The first image provided is the REFERENCE JEWELRY ITEM. Use its exact shape, color, and material.
    2. The second image provided is the BRAND LOGO. You MUST overlay this logo in the TOP LEFT CORNER of the generated image as a subtle but visible watermark (opacity 80%).
    
    Output:
    A single, stunning, award-winning commercial jewelry photograph.
  `;

  return retryWithBackoff(async () => {
    try {
      // Using gemini-3-pro-image-preview (Nano Banana Pro) for high quality 2K images
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: {
          parts: [
            { 
              inlineData: { 
                mimeType: getMimeType(jewelryBase64), 
                data: stripBase64Prefix(jewelryBase64) 
              } 
            },
            { 
              inlineData: { 
                mimeType: getMimeType(logoBase64), 
                data: stripBase64Prefix(logoBase64) 
              } 
            },
            { text: fullPrompt }
          ]
        },
        config: {
          imageConfig: {
            imageSize: '2K', // Explicitly request 2K resolution
            aspectRatio: '1:1'
          }
        }
      });

      // Extract image
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      throw new Error("No image data in response");
    } catch (error) {
      console.error("Generation error inside retry block:", error);
      throw error;
    }
  });
};

export const editGeneratedImage = async (
  imageBase64: string,
  editPrompt: string
): Promise<string> => {
  const ai = getClient();

  const fullPrompt = `
    You are a professional expert photo editor.
    
    Task:
    Edit the provided image based on the following instruction:
    "${editPrompt}"

    Requirements:
    - Maintain the photo-realistic 2K quality.
    - Keep the core jewelry item intact unless asked to modify it.
    - Apply lighting, background, or stylistic changes as requested.
    
    Output:
    The edited image in high resolution.
  `;

  return retryWithBackoff(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: {
          parts: [
            { 
              inlineData: { 
                mimeType: getMimeType(imageBase64), 
                data: stripBase64Prefix(imageBase64) 
              } 
            },
            { text: fullPrompt }
          ]
        },
        config: {
          imageConfig: {
            imageSize: '2K',
            aspectRatio: '1:1'
          }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      throw new Error("No image data in response");
    } catch (error) {
      console.error("Edit generation error:", error);
      throw error;
    }
  });
};