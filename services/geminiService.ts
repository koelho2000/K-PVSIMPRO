import { GoogleGenAI } from "@google/genai";
import { ProjectState } from "../types";

// Safety check for API Key presence (though we assume it exists per instructions)
const apiKey = process.env.API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

export const getClimateInfo = async (location: string): Promise<{ description: string, lat: number, lng: number, mapUri?: string }> => {
  if (!apiKey) {
    // Fallback for demo if no key
    return {
      description: "Dados climáticos simulados (Sem API Key)",
      lat: 38.7223,
      lng: -9.1393,
    };
  }

  try {
    const model = 'gemini-2.5-flash';
    const response = await ai.models.generateContent({
      model,
      contents: `Forneça as coordenadas (latitude, longitude) e uma breve descrição climática para produção solar em: ${location}. Se possível, forneça um link do Google Maps.`,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    const text = response.text || "";
    
    // Attempt to extract lat/lng from text or grounding metadata
    // This is a heuristic parser for the text response since grounding chunks handle the display links
    let lat = 38.7223;
    let lng = -9.1393;
    
    // Simple regex for lat long if the model outputs them explicitly
    const latMatch = text.match(/lat.*?(-?\d+\.\d+)/i);
    const lngMatch = text.match(/long.*?(-?\d+\.\d+)/i);
    
    if (latMatch) lat = parseFloat(latMatch[1]);
    if (lngMatch) lng = parseFloat(lngMatch[1]);

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    let mapUri = "";
    if (groundingChunks) {
        // Find the first map URI
        for (const chunk of groundingChunks) {
            if (chunk.web?.uri?.includes("maps.google") || chunk.web?.uri?.includes("google.com/maps")) {
                mapUri = chunk.web.uri;
                break;
            }
        }
    }

    return {
      description: text,
      lat,
      lng,
      mapUri
    };
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      description: "Erro ao obter dados climáticos. Usando padrão Lisboa.",
      lat: 38.7223,
      lng: -9.1393,
    };
  }
};

export const suggestSystem = async (project: ProjectState): Promise<string> => {
  if (!apiKey) return "API Key em falta para recomendação inteligente.";

  try {
    const prompt = `
      Atue como um engenheiro fotovoltaico senior.
      Com base nos seguintes dados:
      Localização: ${project.settings.address}
      Consumo Anual: ${project.loadProfile.annualConsumptionKwh} kWh
      Objetivo: ${project.systemConfig.optimizationGoal}
      
      Sugira uma configuração de sistema (Potência kWp, Capacidade de Bateria kWh) e explique porquê. Responda em Português de Portugal.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "Sem recomendação disponível.";
  } catch (error) {
    return "Erro ao gerar recomendação.";
  }
};
