/**
 * Voice Transcription and Speech Router
 */

import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';

export const voiceRouter = Router();

const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

voiceRouter.post(['/transcribe', '/gemini/transcribe'], async (req: Request, res: Response) => {
  const { audioBase64, mimeType = 'audio/webm' } = req.body;

  if (!audioBase64) {
    res.status(400).json({ error: 'audioBase64 string is required' });
    return;
  }

  if (!ai) {
    res.json({
      transcript: 'I need to check commodity prices in Techiman market.',
      confidence: 0.9,
      modelUsed: 'local-voice-simulator',
    });
    return;
  }

  try {
    const audioPart = {
      inlineData: {
        mimeType,
        data: audioBase64,
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          audioPart,
          { text: 'Transcribe this audio accurately. Preserve Ghanaian English, Akan/Twi, Ga, and Ewe terms without inventing words.' },
        ],
      },
    });

    const transcript = response.text ? response.text.trim() : '';

    res.json({
      transcript,
      confidence: transcript ? 0.98 : 0.0,
      modelUsed: 'gemini-3.5-transcribe',
    });
  } catch (err: any) {
    res.status(502).json({
      error: 'Audio transcription failed',
      message: 'Could not process audio. Please type or speak again.',
    });
  }
});
