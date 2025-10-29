
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import type { FormData, Storyboard, StoryboardStructure, Clip } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const fileToGenerativePart = (base64: string, mimeType: string) => {
  return {
    inlineData: {
      data: base64,
      mimeType,
    },
  };
};

// Helper to convert base64 to raw bytes for audio decoding
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export const generateStoryboard = async (
  formData: FormData,
  onProgress: (message: string) => void
): Promise<Storyboard> => {
  onProgress("Menganalisis cerita dan karakter...");
  
  const storyPrompt = `
    You are an expert storyboard writer and AI prompt engineer for video creation.
    Based on the following story details, create a complete storyboard.

    Story Title: "${formData.title}"
    Description: "${formData.description}"
    Style: "${formData.style}"

    Characters:
    - Character 1: The main protagonist, based on the first uploaded image.
    - Character 2: The secondary protagonist, based on the second uploaded image (if provided).

    Your task is to generate a JSON object representing a 4-scene storyboard.
    - Each scene must have 3 clips.
    - For each clip, you must provide:
      1. a short, one-sentence narration in Indonesian.
      2. a detailed, descriptive image generation prompt in English for a ${formData.aspectRatio === '9:16' ? 'portrait' : 'landscape'} aspect ratio. This prompt must describe the camera shot (e.g., cinematic wide shot, close-up, over-the-shoulder), the characters' actions, the environment, and the lighting. Describe characters naturally based on the reference images (e.g., "a woman with long silver hair," "a man in a dark coat"). Do not use generic placeholders like "[CHARACTER_1]". The prompt must be consistent with the requested style: "${formData.style}".

    The story must be coherent and follow a logical progression. Ensure the characters remain consistent throughout the story.
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: storyPrompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        scene: { type: Type.INTEGER },
                        clips: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    clip: { type: Type.INTEGER },
                                    narration: { type: Type.STRING, description: "Narration in Indonesian" },
                                    prompt: { type: Type.STRING, description: "Image generation prompt in English" }
                                },
                                required: ["clip", "narration", "prompt"]
                            }
                        }
                    },
                    required: ["scene", "clips"]
                }
            }
        }
    });

  const storyStructure: StoryboardStructure = JSON.parse(response.text);

  onProgress("Membuat visual untuk setiap klip...");

  const finalStoryboard: Storyboard = [];
  let clipCount = 0;
  const totalClips = storyStructure.reduce((acc, scene) => acc + scene.clips.length, 0);

  for (const scene of storyStructure) {
      const generatedClips: Clip[] = [];
      for (const clip of scene.clips) {
          onProgress(`Membuat visual & audio untuk adegan ${scene.scene}, klip ${clip.clip}... (${++clipCount}/${totalClips})`);

          // Image Generation
          const imageParts: any[] = [];
          if (formData.character1) {
              imageParts.push(fileToGenerativePart(formData.character1.base64, formData.character1.file.type));
          }
          if (formData.character2) {
              imageParts.push(fileToGenerativePart(formData.character2.base64, formData.character2.file.type));
          }
          const imagePrompt = `Using the provided reference images for the characters, generate an image for the following prompt: ${clip.prompt}`
          imageParts.push({ text: imagePrompt });

          const imagePromise = ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: { parts: imageParts },
              config: { responseModalities: [Modality.IMAGE] }
          });

          // Audio Generation
          const audioPromise = ai.models.generateContent({
              model: 'gemini-2.5-flash-preview-tts',
              contents: [{ parts: [{ text: clip.narration }] }],
              config: {
                  responseModalities: [Modality.AUDIO],
                  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
              }
          });

          const [imageResponse, audioResponse] = await Promise.all([imagePromise, audioPromise]);
          
          const findInlineData = (response: GenerateContentResponse): string | undefined => {
              for (const part of response.candidates?.[0]?.content?.parts ?? []) {
                if (part.inlineData) {
                  return part.inlineData.data;
                }
              }
              return undefined;
          };

          const imageB64 = findInlineData(imageResponse);
          const audioB64 = findInlineData(audioResponse);

          if (!imageB64 || !audioB64) {
              console.error("Image Response:", JSON.stringify(imageResponse, null, 2));
              console.error("Audio Response:", JSON.stringify(audioResponse, null, 2));
              throw new Error(`Gagal membuat konten untuk klip ${clip.clip} di adegan ${scene.scene}. Respon API tidak valid atau diblokir.`);
          }
          
          generatedClips.push({
              ...clip,
              image: `data:image/png;base64,${imageB64}`,
              audio: audioB64,
          });
      }
      finalStoryboard.push({ scene: scene.scene, clips: generatedClips });
  }

  onProgress("Selesai!");
  return finalStoryboard;
};


// Audio Player Logic
let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

const getAudioContext = () => {
    if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return audioContext;
};

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length;
  const buffer = ctx.createBuffer(1, frameCount, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}


export const playAudio = async (base64: string, onEnded: () => void) => {
    stopAudio();
    const ctx = getAudioContext();
    const rawAudio = decode(base64);
    const audioBuffer = await decodeAudioData(rawAudio, ctx);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.onended = () => {
        currentSource = null;
        onEnded();
    };
    source.start();
    currentSource = source;
};

export const stopAudio = () => {
    if (currentSource) {
        currentSource.stop();
        currentSource.disconnect();
        currentSource = null;
    }
};
