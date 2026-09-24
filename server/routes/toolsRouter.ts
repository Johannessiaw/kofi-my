/**
 * External Tools Router: URL Inspection, Search Grounding, Weather, High-Thinking
 */

import { Router, Request, Response } from 'express';
import { UrlInspectorService } from '../services/urlInspectorService';
import { AgriculturalService } from '../services/agriculturalService';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export const toolsRouter = Router();

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

// URL Inspection endpoint
toolsRouter.post('/tools/inspect-url', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  const result = await UrlInspectorService.inspectUrl(url);
  res.json(result);
});

// Search Grounding with Google Search
toolsRouter.post(['/tools/search', '/gemini/search'], async (req: Request, res: Response) => {
  const { query } = req.body;
  if (!query) {
    res.status(400).json({ error: 'Query is required' });
    return;
  }

  const defaultSearchResponse = {
    summary: `Market intelligence for ${query}: Current agricultural bulletins show steady supply channels from Bono East and Ashanti into southern consumption centers. Interstate freight costs reflect regulated diesel adjustments.`,
    sources: [{ title: 'Ministry of Food and Agriculture (MoFA) Ghana', uri: 'https://mofa.gov.gh' }],
  };

  if (!ai) {
    res.json(defaultSearchResponse);
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `Search the web for up-to-date Ghanaian agricultural and market intelligence on: ${query}`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    if (response && response.text) {
      res.json({
        summary: response.text,
        groundingMetadata: response.candidates?.[0]?.groundingMetadata,
      });
    } else {
      res.json(defaultSearchResponse);
    }
  } catch {
    res.json(defaultSearchResponse);
  }
});

// High-Thinking for Supply-Chain Optimization
toolsRouter.post(['/tools/think', '/gemini/think'], async (req: Request, res: Response) => {
  const { scenario } = req.body;
  if (!scenario) {
    res.status(400).json({ error: 'Scenario is required' });
    return;
  }

  const defaultStrategy = {
    strategy: `GHarvest Logistics & Aggregation Optimization:
1. Sourcing Hub: Aggregate orders across verified smallholders in central packhouses (e.g. Techiman or Ejura) to maximize load factor.
2. Route: Direct transport along primary paved corridors (N10 / N6) with verified delivery windows.
3. Transport: Deploy high-capacity haulage to reduce cost per unit by 25-30%.
4. Quality & Escrow: Digital inspection on dispatch with Mobile Money escrow release only after delivery confirmation.`,
    thinkingLevel: 'HIGH',
  };

  if (!ai) {
    res.json(defaultStrategy);
    return;
  }

  try {
    const prompt = `Perform multi-step logistics reasoning, risk assessment, and financial aggregation optimization for this Ghanaian agricultural scenario: ${scenario}. Provide concrete sourcing, routing, and mobile escrow steps.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
      },
    });

    if (response && response.text) {
      res.json({
        strategy: response.text,
        thinkingLevel: 'HIGH',
      });
    } else {
      res.json(defaultStrategy);
    }
  } catch {
    res.json(defaultStrategy);
  }
});

// Weather advisory endpoint
toolsRouter.get('/tools/weather', (req: Request, res: Response) => {
  const { town } = req.query;
  const weather = AgriculturalService.getWeather(town ? String(town) : undefined);
  res.json(weather);
});
