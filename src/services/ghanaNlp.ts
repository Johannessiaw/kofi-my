import { ASR_CORRECTIONS_DICT, GHANAIAN_CROPS, GHANAIAN_TOWNS, GHANAIAN_UNITS } from './ghanaNlpData';

export interface NormalizedResult {
  raw: string;
  normalized: string;
  detectedLanguage: 'en-GH' | 'ak-GH' | 'mixed';
  correctionsApplied: { from: string; to: string }[];
  entities: {
    crop?: string;
    quantity?: number;
    unit?: string;
    location?: string;
    deliveryDate?: string;
    price?: number;
    currency?: string;
    phone?: string;
  };
  confidence: number;
}

/**
 * Normalizes raw speech transcription into verified Ghanaian agricultural terms,
 * applying GhanaNLP phonetic mappings, town resolution, and code-switching interpretation.
 */
export function normalizeGhanaianSpeech(rawText: string): NormalizedResult {
  if (!rawText || !rawText.trim()) {
    return {
      raw: '',
      normalized: '',
      detectedLanguage: 'en-GH',
      correctionsApplied: [],
      entities: {},
      confidence: 1.0,
    };
  }

  let text = rawText.trim();
  const lower = text.toLowerCase();
  const correctionsApplied: { from: string; to: string }[] = [];
  let isTwi = false;
  let isEnglish = true;

  // 1. Check for Twi vocabulary markers
  const twiMarkers = ['me pɛ', 'sɛ me', 'aduasa', 'aduanan', 'adaduonum', 'aburo', 'bankye', 'bayere', 'borɔdeɛ', 'wɔ', 'fa kɔ', 'sɛn na'];
  for (const marker of twiMarkers) {
    if (lower.includes(marker)) {
      isTwi = true;
      break;
    }
  }

  // 2. Apply ASR corrections dictionary
  let normalizedText = text;
  // Sort keys by length descending to match multi-word phrases first
  const sortedKeys = Object.keys(ASR_CORRECTIONS_DICT).sort((a, b) => b.length - a.length);

  for (const errorKey of sortedKeys) {
    const regex = new RegExp(`\\b${errorKey}\\b`, 'gi');
    if (regex.test(normalizedText)) {
      const target = ASR_CORRECTIONS_DICT[errorKey];
      normalizedText = normalizedText.replace(regex, target);
      correctionsApplied.push({ from: errorKey, to: target });
    }
  }

  // 3. Normalize specific town common errors
  for (const town of GHANAIAN_TOWNS) {
    for (const err of town.commonErrors) {
      const regex = new RegExp(`\\b${err}\\b`, 'gi');
      if (regex.test(normalizedText)) {
        normalizedText = normalizedText.replace(regex, town.name);
        correctionsApplied.push({ from: err, to: town.name });
      }
    }
  }

  // 4. Entity Extraction
  const entities: NormalizedResult['entities'] = {};

  // Extract Crop
  for (const crop of GHANAIAN_CROPS) {
    const cropTerms = [crop.name.toLowerCase(), crop.localName.toLowerCase(), crop.twi.toLowerCase()];
    for (const term of cropTerms) {
      if (normalizedText.toLowerCase().includes(term)) {
        entities.crop = crop.name;
        break;
      }
    }
    if (entities.crop) break;
  }

  // Extract Location (Town)
  for (const town of GHANAIAN_TOWNS) {
    const regex = new RegExp(`\\b${town.name}\\b`, 'i');
    if (regex.test(normalizedText)) {
      entities.location = town.name;
      break;
    }
  }

  // Extract Unit
  for (const unit of GHANAIAN_UNITS) {
    const simpleUnitName = unit.name.split(' ')[0].toLowerCase();
    const regex = new RegExp(`\\b(${simpleUnitName}|crates|crate|bags|bag|sacks|sack|tubers|tuber|tonnes|tonne|boxes|box|baskets|basket|load|loads)\\b`, 'i');
    const match = normalizedText.match(regex);
    if (match) {
      entities.unit = match[0].toLowerCase();
      break;
    }
  }

  // Extract Quantity (numbers, both digits and words)
  const numRegex = /\b(\d+)\b/;
  const numMatch = normalizedText.match(numRegex);
  if (numMatch) {
    entities.quantity = parseInt(numMatch[1], 10);
  } else {
    // Check written numbers
    const writtenNumbers: Record<string, number> = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'ten': 10, 'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
      'hundred': 100, 'two hundred': 200, 'three hundred': 300, 'five hundred': 500,
      'thousand': 1000, 'two thousand': 2000, 'five thousand': 5000,
    };
    for (const [word, val] of Object.entries(writtenNumbers)) {
      if (normalizedText.toLowerCase().includes(word)) {
        entities.quantity = val;
        break;
      }
    }
  }

  // Extract Ghana Phone number pattern: e.g. 024..., 055..., 020..., 050..., 027...
  const phoneRegex = /\b(0(?:24|25|53|54|55|59|20|50|27|57|26)\s?\d{3}\s?\d{4})\b/;
  const phoneMatch = normalizedText.match(phoneRegex);
  if (phoneMatch) {
    entities.phone = phoneMatch[0].replace(/\s/g, '');
  }

  // Extract Price / Currency
  const priceRegex = /(?:ghs|gh¢|cedis)\s*(\d+(?:,\d+)?(?:\.\d+)?)/i;
  const priceMatch = normalizedText.match(priceRegex);
  if (priceMatch) {
    entities.price = parseFloat(priceMatch[1].replace(/,/g, ''));
    entities.currency = 'GHS';
  }

  const detectedLanguage = isTwi ? (isEnglish ? 'mixed' : 'ak-GH') : 'en-GH';

  return {
    raw: rawText,
    normalized: normalizedText,
    detectedLanguage,
    correctionsApplied,
    entities,
    confidence: correctionsApplied.length > 0 ? 0.95 : 0.88,
  };
}

/**
 * Ghana Phonetic Dictionary for natural Text-To-Speech (TTS)
 * Replaces hard-to-pronounce Ghanaian words with phonetic spellings
 * so standard TTS engines speak with authentic Ghanaian cadence.
 */
export const GHANAIAN_TTS_PRONUNCIATION_MAP: Record<string, string> = {
  'Techiman': 'Teh-chee-mahn',
  'Kumasi': 'Koo-mah-see',
  'Sunyani': 'Soon-yah-nee',
  'Tamale': 'Tah-mah-lay',
  'Ejura': 'Eh-joo-rah',
  'Koforidua': 'Koh-foh-ree-dwah',
  'Takoradi': 'Tah-koh-rah-dee',
  'Atebubu': 'Ah-teh-boo-boo',
  'Nkoranza': 'En-koh-ran-zah',
  'Wenchi': 'Wen-chee',
  'Kejetia': 'Keh-jeh-tee-ah',
  'Agbogbloshie': 'Ah-gbog-bloh-shee',
  'GHarvest': 'G-Harvest',
  'Kofi': 'Koh-fee',
  'Aboagye': 'Ah-bwah-jeh',
  'Aburo': 'Ah-boo-roh',
  'Bankye': 'Bahn-chay',
  'Bayere': 'Bah-yeh-reh',
  'Borode': 'Baw-raw-deh',
  'Mankani': 'Mahn-kah-nee',
  'Nsusuwa': 'En-soo-soo-wah',
  'GHS': 'Ghana cedis',
  'GH₵': 'Ghana cedis',
  'cedis': 'cedis',
};

/**
 * Formats text for Ghanaian speech output
 */
export function prepareGhanaianSpeechText(text: string): string {
  let output = text;
  for (const [word, phonetic] of Object.entries(GHANAIAN_TTS_PRONUNCIATION_MAP)) {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    output = output.replace(regex, phonetic);
  }
  // Ensure currency is read aloud as "Ghana cedis"
  output = output.replace(/GH₵\s*(\d+(?:,\d+)?)/g, '$1 Ghana cedis');
  output = output.replace(/GHS\s*(\d+(?:,\d+)?)/g, '$1 Ghana cedis');
  return output;
}
