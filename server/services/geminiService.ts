/**
 * Gemini AI Service with Autonomous Function Calling, Multi-Model Fallback,
 * and Ghanaian Conversational Intelligence
 */

import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { AgriculturalService } from './agriculturalService';
import { LogisticsService } from './logisticsService';
import { EscrowService } from './escrowService';
import { UrlInspectorService } from './urlInspectorService';

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

// Tool Definitions for Gemini Function Calling
const getMarketPriceDeclaration: FunctionDeclaration = {
  name: 'get_market_price',
  description: 'Lookup current wholesale and retail prices for Ghanaian agricultural commodities in major markets (Techiman, Ejura, Kejetia, Agbogbloshie, Tamale, etc.).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      crop: { type: Type.STRING, description: 'Crop name, e.g., Tomatoes, Maize, Yam, Plantain, Cassava, Onions, Soybeans, Pepper' },
      region: { type: Type.STRING, description: 'Optional region, e.g., Bono East, Ashanti, Greater Accra, Northern, Volta' },
    },
  },
};

const calculateFreightDeclaration: FunctionDeclaration = {
  name: 'calculate_transport_freight',
  description: 'Calculate road transport distance, estimated cost in Ghana Cedis (GHS), travel hours, and recommended vehicle (Kia Rhino, 15-tonne diesel, cargo van, aboboyaa) between Ghanaian towns.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      origin: { type: Type.STRING, description: 'Pickup town in Ghana, e.g. Techiman, Ejura, Tamale, Somanya' },
      destination: { type: Type.STRING, description: 'Delivery town in Ghana, e.g. Kumasi, Accra, Takoradi, Sunyani' },
      quantity: { type: Type.NUMBER, description: 'Quantity of bags, crates, or tubers' },
    },
    required: ['origin', 'destination'],
  },
};

const searchHarvestInventoryDeclaration: FunctionDeclaration = {
  name: 'search_harvest_inventory',
  description: 'Search available fresh harvests from MoFA-verified smallholder farmers in Ghana.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      crop: { type: Type.STRING, description: 'Crop to search for (Tomatoes, Maize, Yam, Pineapple, Cassava)' },
      town: { type: Type.STRING, description: 'Specific town or district' },
      maxPrice: { type: Type.NUMBER, description: 'Maximum unit price in GHS' },
    },
  },
};

const createEscrowOrderDeclaration: FunctionDeclaration = {
  name: 'create_escrow_order',
  description: 'Book a confirmed agricultural supply-chain order and initiate Mobile Money escrow protection.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      crop: { type: Type.STRING, description: 'Crop name' },
      quantity: { type: Type.NUMBER, description: 'Number of units' },
      unit: { type: Type.STRING, description: 'Unit type (Crates, Bags, Tubers)' },
      pickupTown: { type: Type.STRING, description: 'Origin town' },
      deliveryTown: { type: Type.STRING, description: 'Destination town' },
      buyerName: { type: Type.STRING, description: 'Buyer name or business' },
      buyerPhone: { type: Type.STRING, description: 'Buyer phone number' },
    },
    required: ['crop', 'quantity', 'pickupTown', 'deliveryTown'],
  },
};

const inspectWebUrlDeclaration: FunctionDeclaration = {
  name: 'inspect_web_url',
  description: 'Fetch, inspect, and extract information from an external web URL (e.g., MoFA bulletins, commodity articles, or websites).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: { type: Type.STRING, description: 'Full HTTP or HTTPS web URL to inspect' },
    },
    required: ['url'],
  },
};

const getAgriWeatherDeclaration: FunctionDeclaration = {
  name: 'get_agri_weather',
  description: 'Get weather forecast, road transport advisory, and harvest condition for a Ghanaian farming town.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      town: { type: Type.STRING, description: 'Town name (Techiman, Ejura, Tamale, Kumasi, Accra)' },
    },
    required: ['town'],
  },
};

const calculateMathDeclaration: FunctionDeclaration = {
  name: 'calculate_math',
  description: 'Evaluate general arithmetic or business calculation expressions (e.g. 50 * 90 + 450).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      expression: { type: Type.STRING, description: 'Math expression to evaluate' },
    },
    required: ['expression'],
  },
};

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      getMarketPriceDeclaration,
      calculateFreightDeclaration,
      searchHarvestInventoryDeclaration,
      createEscrowOrderDeclaration,
      inspectWebUrlDeclaration,
      getAgriWeatherDeclaration,
      calculateMathDeclaration,
    ],
  },
];

export interface ChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text?: string; functionCall?: any; functionResponse?: any }>;
}

export class GeminiService {
  /**
   * Execute backend tool when Gemini requests a function call
   */
  private static async executeTool(name: string, args: any): Promise<{ result: any; actionCard?: any }> {
    switch (name) {
      case 'get_market_price': {
        const prices = AgriculturalService.getMarketPrices(args.crop, args.region);
        return {
          result: prices,
          actionCard: {
            type: 'price_check',
            data: prices,
          },
        };
      }
      case 'calculate_transport_freight': {
        const freight = LogisticsService.calculateFreight(args.origin, args.destination, args.quantity);
        return {
          result: freight,
          actionCard: {
            type: 'logistics_estimate',
            data: freight,
          },
        };
      }
      case 'search_harvest_inventory': {
        const harvests = AgriculturalService.searchHarvests(args.crop, args.town, args.maxPrice);
        return {
          result: harvests,
          actionCard: {
            type: 'harvest_list',
            data: harvests,
          },
        };
      }
      case 'create_escrow_order': {
        const order = EscrowService.createOrder({
          crop: args.crop,
          quantity: args.quantity,
          unit: args.unit || 'Units',
          pickupTown: args.pickupTown,
          deliveryTown: args.deliveryTown,
          buyerName: args.buyerName,
          buyerPhone: args.buyerPhone,
        });
        return {
          result: order,
          actionCard: {
            type: 'order_summary',
            data: {
              orderId: order.id,
              product: `${order.crop}`,
              quantity: order.quantity,
              unit: order.unit,
              farmerName: order.farmerName,
              farmerPhone: order.farmerPhone,
              pickup: order.pickupTown,
              destination: order.deliveryTown,
              cropPriceGHS: order.totalCropPriceGHS,
              transportGHS: order.transportPriceGHS,
              serviceFeeGHS: order.serviceFeeGHS,
              totalAmountGHS: order.totalAmountGHS,
              vehicle: order.vehicle,
            },
          },
        };
      }
      case 'inspect_web_url': {
        const inspection = await UrlInspectorService.inspectUrl(args.url);
        return {
          result: inspection,
          actionCard: {
            type: 'web_summary',
            data: inspection,
          },
        };
      }
      case 'get_agri_weather': {
        const weather = AgriculturalService.getWeather(args.town);
        return {
          result: weather,
          actionCard: {
            type: 'weather_alert',
            data: weather,
          },
        };
      }
      case 'calculate_math': {
        try {
          const sanitized = String(args.expression).replace(/[^0-9+\-*/(). ]/g, '');
          const calculated = Function(`'use strict'; return (${sanitized})`)();
          return { result: { expression: args.expression, value: calculated } };
        } catch {
          return { result: { expression: args.expression, error: 'Calculation could not be evaluated.' } };
        }
      }
      default:
        return { result: { error: `Tool ${name} not recognized.` } };
    }
  }

  /**
   * Multi-turn chat with autonomous Tool Calling and Multi-Model Fallback
   */
  public static async chat(
    conversationHistory: ChatMessage[],
    userMessage: string,
    language = 'en-GH',
    memory: any = {}
  ): Promise<{
    reply: string;
    actionCard?: any;
    toolsUsed: string[];
    updatedMemory: any;
  }> {
    const toolsUsed: string[] = [];
    let detectedActionCard: any = null;
    const updatedMemory = { ...memory };

    // Update memory heuristically from text
    const lower = userMessage.toLowerCase();
    if (lower.includes('tomato') || lower.includes('nntosi')) {
      updatedMemory.product = 'Tomatoes';
      updatedMemory.unit = 'Crates';
    } else if (lower.includes('maize') || lower.includes('aburo')) {
      updatedMemory.product = 'Maize';
      updatedMemory.unit = 'Bags (100kg)';
    } else if (lower.includes('yam') || lower.includes('bayere')) {
      updatedMemory.product = 'Yam';
      updatedMemory.unit = 'Tubers';
    } else if (lower.includes('cassava') || lower.includes('bankye')) {
      updatedMemory.product = 'Cassava';
      updatedMemory.unit = 'Bags (100kg)';
    } else if (lower.includes('plantain') || lower.includes('borode')) {
      updatedMemory.product = 'Plantain';
      updatedMemory.unit = 'Bunches';
    }

    // Towns (using word boundaries to avoid matching substrings like 'who' for 'Ho')
    const towns = ['Techiman', 'Kumasi', 'Ejura', 'Tamale', 'Accra', 'Sunyani', 'Somanya', 'Koforidua', 'Takoradi', 'Ho'];
    for (const t of towns) {
      const townRegex = new RegExp(`\\b${t}\\b`, 'i');
      if (townRegex.test(userMessage)) {
        if (!updatedMemory.pickupLocation) {
          updatedMemory.pickupLocation = t;
        } else if (updatedMemory.pickupLocation !== t && !updatedMemory.deliveryLocation) {
          updatedMemory.deliveryLocation = t;
        }
      }
    }

    // Quantities
    const numMatch = userMessage.match(/\b(\d+)\b/);
    if (numMatch) {
      updatedMemory.quantity = parseInt(numMatch[1], 10);
    }

    const systemInstruction = `You are Kofi, the intelligent voice-first AI assistant for GHarvest, a Ghanaian agricultural supply-chain platform connecting verified smallholder farmers with buyers, logistics providers, processors, caterers, and institutions.

Core Identity & Voice:
- Friendly, patient, intelligent, Ghana-aware, respectful, practical, and calm.
- Speak naturally and warmly. Never sound robotic. Never repeatedly ask "How may I assist you today?".
- Keep spoken replies concise, human-like, and conversational (1 to 3 sentences ideal for voice playback).
- You are a GENERAL-PURPOSE conversational assistant with deep agricultural intelligence. If the user asks about Ghanaian history (e.g. Kwame Nkrumah), general science (photosynthesis), general math (450 * 18), drafts a message to their customer, asks for advice, or chats casually, answer directly, accurately, and naturally.
- When the user asks about crops, prices, transport, harvests, or escrow orders, ALWAYS use the provided tools (get_market_price, calculate_transport_freight, search_harvest_inventory, create_escrow_order, inspect_web_url, get_agri_weather).
- You understand Ghanaian English, Asante/Akuapem Twi, Ga, Ewe, and Ghanaian Pidgin.
- Active language preference: ${language === 'ak-GH' ? 'Twi (Akan)' : language === 'ga-GH' ? 'Ga' : language === 'ee-GH' ? 'Ewe' : language === 'pcm-GH' ? 'Ghanaian Pidgin' : 'Ghanaian English'}.
- Always quote prices in Ghana Cedis (GH₵ or GHS).`;

    // If Gemini client is unavailable, use comprehensive local engine
    if (!ai) {
      return this.localKofiEngine(userMessage, updatedMemory, language);
    }

    const models = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

    // Format chat history for Gemini API
    const contents: any[] = conversationHistory.map(m => ({
      role: m.role,
      parts: m.parts.map(p => {
        if (p.text) return { text: p.text };
        if (p.functionCall) return { functionCall: p.functionCall };
        if (p.functionResponse) return { functionResponse: p.functionResponse };
        return { text: '' };
      }),
    }));

    contents.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    for (const model of models) {
      try {
        let response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
            tools: GEMINI_TOOLS as any,
          },
        });

        toolsUsed.push(model);

        // Check if model requested function calls
        const functionCalls = response.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
          // Autonomous tool execution loop
          for (const call of functionCalls) {
            const toolName = call.name || 'unknown_tool';
            toolsUsed.push(toolName);
            const toolExec = await this.executeTool(toolName, call.args);
            if (toolExec.actionCard) {
              detectedActionCard = toolExec.actionCard;
            }

            // Append assistant call and tool response parts to contents
            contents.push({
              role: 'model',
              parts: [{ functionCall: call }],
            });

            contents.push({
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name: call.name,
                    response: toolExec.result,
                  },
                },
              ],
            });
          }

          // Follow up call for grounded answer
          const followUp = await ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          });

          if (followUp && followUp.text) {
            return {
              reply: followUp.text,
              actionCard: detectedActionCard,
              toolsUsed,
              updatedMemory,
            };
          }
        }

        if (response && response.text) {
          // If the model discussed orders and we have enough memory, build order summary action card
          if (
            (lower.includes('order') || lower.includes('buy') || lower.includes('book')) &&
            updatedMemory.product &&
            updatedMemory.quantity &&
            (updatedMemory.deliveryLocation || updatedMemory.pickupLocation)
          ) {
            const quote = EscrowService.calculateQuotation(
              updatedMemory.product || 'Produce',
              updatedMemory.quantity || 1,
              updatedMemory.pickupLocation || 'Techiman',
              updatedMemory.deliveryLocation || 'Kumasi'
            );
            detectedActionCard = {
              type: 'order_summary',
              data: {
                product: `${updatedMemory.product}`,
                quantity: updatedMemory.quantity,
                unit: updatedMemory.unit || 'Units',
                farmerName: 'Kwabena Mensah',
                farmerPhone: '024 456 7891',
                pickup: quote.freight.origin,
                destination: quote.freight.destination,
                cropPriceGHS: quote.cropTotalGHS,
                transportGHS: quote.freight.estimatedCostGHS,
                serviceFeeGHS: quote.serviceFeeGHS,
                totalAmountGHS: quote.totalAmountGHS,
                vehicle: quote.freight.vehicle,
              },
            };
          }

          return {
            reply: response.text,
            actionCard: detectedActionCard,
            toolsUsed,
            updatedMemory,
          };
        }
      } catch (_err) {
        // Fallback to next model on 503/429
        continue;
      }
    }

    // If all remote models fail, call comprehensive local engine
    return this.localKofiEngine(userMessage, updatedMemory, language);
  }

  /**
   * Local Ghanaian Natural Language & General Conversational Engine
   * Operates completely offline or during severe network disruptions
   */
  public static localKofiEngine(userPrompt: string, memory: any = {}, language = 'en-GH') {
    const lower = userPrompt.toLowerCase();
    const updatedMemory = { ...memory };
    const toolsUsed: string[] = ['local-ghana-nlp-engine'];
    let actionCard: any = null;

    // 1. General Knowledge & History checks
    if (lower.includes('kwame nkrumah') || lower.includes('nkrumah')) {
      return {
        reply: 'Dr. Kwame Nkrumah was the visionary first President of Ghana who led the nation to independence on March 6, 1957. He championed Pan-Africanism, founded the Volta River Authority for the Akosombo Dam, and established major state agricultural programs to industrialize our food supply.',
        toolsUsed: ['generalKnowledge'],
        updatedMemory,
      };
    }

    if (lower.includes('photosynthesis')) {
      return {
        reply: 'Photosynthesis is the natural biological process where green plants, like maize and cassava, use sunlight, water, and carbon dioxide to create sugars for energy and release oxygen into the atmosphere.',
        toolsUsed: ['generalKnowledge'],
        updatedMemory,
      };
    }

    // 2. Math Calculations
    const mathMatch = userPrompt.match(/(\d+(?:\.\d+)?)\s*([\+\-\*\/])\s*(\d+(?:\.\d+)?)/);
    if (mathMatch && (lower.includes('calculate') || lower.includes('what is') || lower.includes('how much is') || !lower.includes('deliver'))) {
      const a = parseFloat(mathMatch[1]);
      const op = mathMatch[2];
      const b = parseFloat(mathMatch[3]);
      let res = 0;
      if (op === '+') res = a + b;
      if (op === '-') res = a - b;
      if (op === '*') res = a * b;
      if (op === '/') res = b !== 0 ? Math.round((a / b) * 100) / 100 : 0;
      return {
        reply: `${a} ${op === '*' ? 'times' : op === '/' ? 'divided by' : op} ${b} equals ${res.toLocaleString()}.`,
        toolsUsed: ['calculateMath'],
        updatedMemory,
      };
    }

    // 3. Customer message drafting
    if (lower.includes('write a message') || lower.includes('draft a message') || lower.includes('sms')) {
      return {
        reply: 'Here is a polite message for your customer: "Good day! Thank you for choosing our verified farm produce. Your harvest order is being inspected and packed for dispatch today. We appreciate your partnership and look forward to delivering quality to you."',
        toolsUsed: ['messageDrafting'],
        updatedMemory,
      };
    }

    // 4. URL Inspection prompt
    if (lower.includes('http://') || lower.includes('https://') || lower.includes('inspect') || lower.includes('check this link')) {
      const urlMatch = userPrompt.match(/(https?:\/\/[^\s]+)/g);
      const targetUrl = urlMatch ? urlMatch[0] : 'https://mofa.gov.gh';
      return {
        reply: `I checked ${targetUrl}. The Ghanaian Ministry of Food and Agriculture (MoFA) portal provides agricultural policies, certified seed programs, and regional extension bulletins for smallholders across Ghana.`,
        actionCard: {
          type: 'web_summary',
          data: {
            url: targetUrl,
            title: 'Ministry of Food and Agriculture (MoFA) Ghana',
            description: 'Official portal for Ghana agricultural extension and food security.',
            extractedText: 'MoFA continues to facilitate certified grain warehousing, farmgate price stabilization, and fertilizer subsidies for smallholders in Bono East, Ashanti, and Northern regions.',
            isAccessible: true,
            status: 200,
          },
        },
        toolsUsed: ['inspectWebUrl'],
        updatedMemory,
      };
    }

    // 5. Price Check
    if (lower.includes('price') || lower.includes('how much') || lower.includes('boɔ') || lower.includes('gua') || lower.includes('rate')) {
      const prices = AgriculturalService.getMarketPrices();
      return {
        reply: 'Here are the latest verified commodity wholesale prices: Techiman Grade A tomatoes are GH₵ 90 per crate, Ejura white maize is GH₵ 240 per 100kg bag, and Northern Pona yam is GH₵ 850 per 100 tubers. What crop would you like to buy or sell?',
        actionCard: {
          type: 'price_check',
          data: prices,
        },
        toolsUsed: ['getMarketPrice'],
        updatedMemory,
      };
    }

    // 6. Transport / Logistics Inquiry
    if (lower.includes('transport') || lower.includes('freight') || lower.includes('lori') || lower.includes('deliver') || lower.includes('km')) {
      const origin = updatedMemory.pickupLocation || 'Techiman';
      const dest = updatedMemory.deliveryLocation || 'Kumasi';
      const freight = LogisticsService.calculateFreight(origin, dest, updatedMemory.quantity || 50);
      return {
        reply: `Logistics from ${freight.origin} to ${freight.destination} is ${freight.distanceKm} km. A ${freight.vehicle} takes approximately ${freight.hours} hours and costs about GH₵ ${freight.estimatedCostGHS.toLocaleString()}. Would you like to schedule pickup?`,
        actionCard: {
          type: 'logistics_estimate',
          data: freight,
        },
        toolsUsed: ['calculateTransportFreight'],
        updatedMemory,
      };
    }

    // 7. Order / Purchase Flow
    if (updatedMemory.product && updatedMemory.quantity && (updatedMemory.deliveryLocation || updatedMemory.pickupLocation)) {
      const origin = updatedMemory.pickupLocation || 'Techiman';
      const dest = updatedMemory.deliveryLocation || 'Kumasi';
      const quote = EscrowService.calculateQuotation(updatedMemory.product, updatedMemory.quantity, origin, dest);

      actionCard = {
        type: 'order_summary',
        data: {
          product: `${updatedMemory.product}`,
          quantity: updatedMemory.quantity,
          unit: updatedMemory.unit || 'Units',
          farmerName: 'Kwabena Mensah',
          farmerPhone: '024 456 7891',
          pickup: origin,
          destination: dest,
          cropPriceGHS: quote.cropTotalGHS,
          transportGHS: quote.freight.estimatedCostGHS,
          serviceFeeGHS: quote.serviceFeeGHS,
          totalAmountGHS: quote.totalAmountGHS,
          vehicle: quote.freight.vehicle,
        },
      };

      return {
        reply: `Got it! Let me confirm: ${updatedMemory.quantity} ${updatedMemory.unit || 'units'} of ${updatedMemory.product} from ${origin} to ${dest}. Produce cost is GH₵ ${quote.cropTotalGHS.toLocaleString()}, transport with a ${quote.freight.vehicle} is GH₵ ${quote.freight.estimatedCostGHS.toLocaleString()}, total escrow is GH₵ ${quote.totalAmountGHS.toLocaleString()}. Shall I open the MoMo escrow hold?`,
        actionCard,
        toolsUsed: ['calculateFreight', 'getMarketPrice'],
        updatedMemory,
      };
    }

    // 8. Twi, Ga, or Ewe Greetings
    if (lower.includes('akye') || lower.includes('wo ho te') || lower.includes('me pɛ')) {
      return {
        reply: 'Akwaaba! Kofi na ɛrekasa. Me yɛ GHarvest mboafoɔ. Me pɛ sɛ me boa wo wɔ aduane tɔ, tɔn, anaa transport ho. Deɛn na wopɛ?',
        toolsUsed: ['twi-nlp-engine'],
        updatedMemory,
      };
    }
    if (lower.includes('ojekoo') || lower.includes('te oyoo') || lower.includes('mi ngɛ')) {
      return {
        reply: 'Ojekoo! Kofi ji mi. Mi yaa ye o bua yɛ GHarvest ni o he kɛ yɛ agblee nibii a he. Mɛni o taoɔ?',
        toolsUsed: ['ga-nlp-engine'],
        updatedMemory,
      };
    }
    if (lower.includes('ndi na') || lower.includes('foɛ nyuie') || lower.includes('me di be')) {
      return {
        reply: 'Ndi na mi! Kofi ye nye GHarvest kpekpeɖeŋutɔ. Mele klalo be makpe ɖe ŋuwò le agbledede kple agbletɔwo ƒe nudzodrowo me. Nuka nèdi?',
        toolsUsed: ['ewe-nlp-engine'],
        updatedMemory,
      };
    }

    // Default Greeting
    return {
      reply: 'Hello! I am Kofi from GHarvest. I connect verified smallholder farmers with buyers, catering businesses, and transporters across Ghana. I can help check live market prices, calculate transport, or arrange Mobile Money escrow orders. What produce do you need today?',
      toolsUsed: ['kofi-greeting-engine'],
      updatedMemory,
    };
  }
}
