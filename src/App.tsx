/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { VoiceOrb } from './components/VoiceOrb';
import { ConversationFeed } from './components/ConversationFeed';
import { QuickPrompts } from './components/QuickPrompts';
import { MarketplaceView } from './components/MarketplaceView';
import { LogisticsTrackerView } from './components/LogisticsTrackerView';
import { GhanaNlpStudioView } from './components/GhanaNlpStudioView';
import { OrderModal } from './components/OrderModal';
import { FarmerListingModal } from './components/FarmerListingModal';
import { JarvisVoiceEngine, VoiceState } from './services/voiceEngine';
import { normalizeGhanaianSpeech } from './services/ghanaNlp';
import { GHarvestDataManager, INITIAL_HARVESTS, INITIAL_ORDERS } from './services/gharvestData';
import { SupportedLanguage, UserRole, VoiceMessage, Order, HarvestListing, ConversationMemory } from './types';
import { Send, Mic, Sparkles, Volume2, Bot, AlertTriangle } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'voice' | 'marketplace' | 'orders' | 'logistics' | 'nlp_studio'>('voice');
  const [language, setLanguage] = useState<SupportedLanguage>('en-GH');
  const [role, setRole] = useState<UserRole>('buyer');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [frequencies, setFrequencies] = useState<Uint8Array>(new Uint8Array(16));
  const [textInput, setTextInput] = useState<string>('');
  const [memory, setMemory] = useState<ConversationMemory>({});
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [harvests, setHarvests] = useState<HarvestListing[]>(INITIAL_HARVESTS);
  const [activeOrderModal, setActiveOrderModal] = useState<any | null>(null);
  const [isFarmerModalOpen, setIsFarmerModalOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<VoiceMessage[]>([
    {
      id: 'init-msg',
      sender: 'kofi',
      normalizedText: "Hello! I'm Kofi, your voice-first AI assistant for GHarvest. I connect verified Ghanaian smallholder farmers with buyers, catering businesses, and transporters. Speak in English or Twi—what agricultural commodity do you need today?",
      timestamp: 'Just now',
      toolsUsed: ['GHarvest-Core', 'GhanaNLP'],
    },
  ]);

  const voiceEngineRef = useRef<JarvisVoiceEngine | null>(null);

  // Initialize Jarvis Voice Engine
  useEffect(() => {
    // Load persisted state
    setOrders(GHarvestDataManager.getOrders());
    setHarvests(GHarvestDataManager.getHarvests());

    const engine = new JarvisVoiceEngine({
      onStateChange: (newState) => {
        setVoiceState(newState);
      },
      onSpeechRecognized: (text, isFinal) => {
        if (isFinal) {
          handleUserQuery(text);
        } else {
          setTextInput(text);
        }
      },
      onError: (err) => {
        console.warn('Voice engine error:', err);
      },
      onAudioFrequencies: (freqData) => {
        setFrequencies(new Uint8Array(freqData));
      },
    });

    voiceEngineRef.current = engine;

    return () => {
      engine.stopSpeaking();
      engine.stopListening();
    };
  }, []);

  // Send query to Kofi
  const handleUserQuery = async (queryText: string) => {
    if (!queryText.trim()) return;

    // 1. Normalize query using GhanaNLP engine
    const norm = normalizeGhanaianSpeech(queryText);

    const userMsg: VoiceMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      rawText: norm.raw,
      normalizedText: norm.normalized,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setTextInput('');

    if (voiceEngineRef.current) {
      voiceEngineRef.current.setState('processing');
    }

    try {
      // Call server-side Gemini chat endpoint
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: norm.normalized,
          memory,
          language,
        }),
      });

      const data = await response.json();

      const kofiMsg: VoiceMessage = {
        id: `kofi-${Date.now()}`,
        sender: 'kofi',
        normalizedText: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionCard: data.actionCard,
        toolsUsed: data.toolsUsed,
      };

      setMessages((prev) => [...prev, kofiMsg]);
      if (data.updatedMemory) {
        setMemory(data.updatedMemory);
      }

      // Voice output
      if (voiceEngineRef.current) {
        voiceEngineRef.current.speak(data.reply);
      }
    } catch (e) {
      console.error('Chat error:', e);
      const fallbackMsg: VoiceMessage = {
        id: `kofi-${Date.now()}`,
        sender: 'kofi',
        normalizedText: "I couldn't reach the server right now. Let me know what crop you need and I'll check our local verified listings.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      if (voiceEngineRef.current) {
        voiceEngineRef.current.setState('idle');
      }
    }
  };

  // Toggle mic
  const handleToggleMic = () => {
    if (voiceState === 'listening') {
      voiceEngineRef.current?.stopListening();
    } else {
      voiceEngineRef.current?.startListening();
    }
  };

  // Interrupt Kofi
  const handleInterrupt = () => {
    voiceEngineRef.current?.stopSpeaking();
  };

  // Speak arbitrary text
  const handleSpeakText = (text: string) => {
    voiceEngineRef.current?.speak(text);
  };

  // Trigger Gemini High Thinking
  const handleTriggerThinking = async (scenario: string) => {
    const userMsg: VoiceMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      normalizedText: `[High-Thinking Request]: ${scenario}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);

    if (voiceEngineRef.current) {
      voiceEngineRef.current.setState('processing');
    }

    try {
      const res = await fetch('/api/gemini/think', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      const data = await res.json();

      const kofiMsg: VoiceMessage = {
        id: `kofi-${Date.now()}`,
        sender: 'kofi',
        normalizedText: data.strategy,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolsUsed: ['gemini-3.8-flash', 'ThinkingLevel.HIGH', 'GHarvest-Logistics-Optimizer'],
      };
      setMessages((prev) => [...prev, kofiMsg]);
      voiceEngineRef.current?.speak("I've evaluated the multi-farmer supply chain. Sourcing and transport consolidation can save 28 percent.");
    } catch {
      voiceEngineRef.current?.setState('idle');
    }
  };

  // Trigger Google Search Grounding
  const handleTriggerSearch = async (query: string) => {
    const userMsg: VoiceMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      normalizedText: `[Google Search Grounding]: ${query}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);

    if (voiceEngineRef.current) {
      voiceEngineRef.current.setState('processing');
    }

    try {
      const res = await fetch('/api/gemini/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();

      const kofiMsg: VoiceMessage = {
        id: `kofi-${Date.now()}`,
        sender: 'kofi',
        normalizedText: data.summary,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolsUsed: ['gemini-3.5-flash', 'googleSearch', 'MoFA-Esoko-Grounding'],
      };
      setMessages((prev) => [...prev, kofiMsg]);
      voiceEngineRef.current?.speak(data.summary);
    } catch {
      voiceEngineRef.current?.setState('idle');
    }
  };

  // Order with Kofi Voice shortcut from Marketplace
  const handleOrderWithKofi = (harvest: HarvestListing) => {
    setCurrentTab('voice');
    const prompt = `I want to order ${harvest.minOrderQuantity * 2} ${harvest.unit} of ${harvest.crop} from ${harvest.farmerName} in ${harvest.locationTown} for delivery in Kumasi.`;
    handleUserQuery(prompt);
  };

  // Finalize order from modal
  const handleFinalizeOrder = (newOrder: Order) => {
    GHarvestDataManager.addOrder(newOrder);
    setOrders(GHarvestDataManager.getOrders());
    setActiveOrderModal(null);

    const confirmationMsg: VoiceMessage = {
      id: `kofi-${Date.now()}`,
      sender: 'kofi',
      normalizedText: `Payment confirmed! Order ${newOrder.id} for ${newOrder.quantity} ${newOrder.unit} of ${newOrder.crop} is locked in escrow. Farmer ${newOrder.farmerName} is preparing shipment to ${newOrder.deliveryTown}. You can track delivery on the Logistics tab.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      toolsUsed: ['MTN-MoMo-Escrow', 'GHarvest-Dispatch'],
    };
    setMessages((prev) => [...prev, confirmationMsg]);
    voiceEngineRef.current?.speak(`Order ${newOrder.id} confirmed and escrow locked. Farmer ${newOrder.farmerName} is notified.`);
  };

  // Update order status
  const handleUpdateOrderStatus = (orderId: string, status: Order['status'], escrowStatus?: Order['escrowStatus'], note?: string) => {
    GHarvestDataManager.updateOrderStatus(orderId, status, escrowStatus, note);
    setOrders(GHarvestDataManager.getOrders());
    voiceEngineRef.current?.playChime(660, 0.15);
  };

  // Add new farmer harvest
  const handleAddHarvest = (newHarvest: HarvestListing) => {
    GHarvestDataManager.addHarvest(newHarvest);
    setHarvests(GHarvestDataManager.getHarvests());
    const msg: VoiceMessage = {
      id: `kofi-${Date.now()}`,
      sender: 'kofi',
      normalizedText: `Akwaaba! Your harvest listing for ${newHarvest.quantityAvailable} ${newHarvest.unit} of ${newHarvest.crop} in ${newHarvest.locationTown} is now live on GHarvest. I will alert verified caterers and buyers for you!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      toolsUsed: ['GHarvest-Farmer-Listing'],
    };
    setMessages((prev) => [...prev, msg]);
    voiceEngineRef.current?.speak("Your harvest has been listed on GHarvest. Buyers will see your verified listing.");
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#08110b] text-gray-100">
      {/* Header with live ticker & navigation */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        language={language}
        onLanguageChange={setLanguage}
        role={role}
        onRoleChange={setRole}
        activeOrderCount={orders.filter((o) => o.status !== 'completed').length}
      />

      {/* Main View Area */}
      <main className="flex-1 overflow-y-auto">
        {currentTab === 'voice' && (
          <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col justify-between min-h-[calc(100vh-130px)]">
            <div>
              {/* Voice Orb Section */}
              <VoiceOrb
                voiceState={voiceState}
                frequencies={frequencies}
                onToggleMic={handleToggleMic}
                onInterrupt={handleInterrupt}
                language={language}
              />

              {/* Quick Scenarios & Tools */}
              <QuickPrompts
                onSelectPrompt={handleUserQuery}
                onTriggerThinking={handleTriggerThinking}
                onTriggerSearch={handleTriggerSearch}
              />

              {/* Multi-turn Conversation Feed */}
              <ConversationFeed
                messages={messages}
                onPlaySpeech={handleSpeakText}
                onConfirmOrder={(orderData) => setActiveOrderModal(orderData)}
                isKofiSpeaking={voiceState === 'speaking'}
              />
            </div>

            {/* Bottom Input Bar for text/voice hybrid */}
            <div className="sticky bottom-3 z-30 pt-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleUserQuery(textInput);
                }}
                className="flex items-center gap-2 bg-[#122318]/95 backdrop-blur-md p-2 rounded-2xl border border-emerald-800/60 shadow-2xl"
              >
                <button
                  type="button"
                  onClick={handleToggleMic}
                  className={`p-2.5 rounded-xl transition ${
                    voiceState === 'listening'
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-emerald-950 text-emerald-400 hover:bg-emerald-900 border border-emerald-800/40'
                  }`}
                  title="Toggle Microphone"
                >
                  <Mic className="w-5 h-5" />
                </button>

                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Ask Kofi or type in English / Twi (e.g. 'I need 50 crates of tomatoes' or 'Me pɛ aburo')..."
                  className="flex-1 bg-transparent border-none text-xs sm:text-sm text-white placeholder-gray-400 focus:outline-none px-2"
                />

                <button
                  type="submit"
                  disabled={!textInput.trim()}
                  className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium shadow-md transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        )}

        {currentTab === 'marketplace' && (
          <MarketplaceView
            harvests={harvests}
            onOrderWithKofi={handleOrderWithKofi}
            onOpenNewListing={() => setIsFarmerModalOpen(true)}
          />
        )}

        {currentTab === 'orders' && (
          <div className="py-4">
            <LogisticsTrackerView
              orders={orders}
              onUpdateOrderStatus={handleUpdateOrderStatus}
            />
          </div>
        )}

        {currentTab === 'logistics' && (
          <div className="py-4">
            <LogisticsTrackerView
              orders={orders}
              onUpdateOrderStatus={handleUpdateOrderStatus}
            />
          </div>
        )}

        {currentTab === 'nlp_studio' && (
          <GhanaNlpStudioView onSpeakSample={handleSpeakText} />
        )}
      </main>

      {/* Order Escrow Modal */}
      {activeOrderModal && (
        <OrderModal
          orderData={activeOrderModal}
          onClose={() => setActiveOrderModal(null)}
          onFinalizeOrder={handleFinalizeOrder}
        />
      )}

      {/* New Harvest Listing Modal */}
      {isFarmerModalOpen && (
        <FarmerListingModal
          onClose={() => setIsFarmerModalOpen(false)}
          onAddHarvest={handleAddHarvest}
        />
      )}
    </div>
  );
}
