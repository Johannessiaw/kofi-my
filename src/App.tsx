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
import { Send, Mic, Sparkles, Volume2, VolumeX, Bot, AlertTriangle, Radio } from 'lucide-react';

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
  const chatAbortControllerRef = useRef<AbortController | null>(null);

  // Global Esc key listener for quick interruption
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (voiceState === 'speaking' || voiceState === 'processing') {
          handleInterrupt();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [voiceState]);

  // Initialize Jarvis Voice Engine and sync backend data
  useEffect(() => {
    // Load persisted state locally first for instant paint
    setOrders(GHarvestDataManager.getOrders());
    setHarvests(GHarvestDataManager.getHarvests());

    // Sync with backend API
    fetch('/api/orders')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setOrders(data);
        }
      })
      .catch(() => {});

    fetch('/api/harvests')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setHarvests(data);
        }
      })
      .catch(() => {});

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
      engine.destroy();
    };
  }, []);

  // Send query to Kofi with support for streaming/aborting during answer production
  const handleUserQuery = async (queryText: string) => {
    if (!queryText.trim()) return;

    // Abort previous in-flight request if any
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    chatAbortControllerRef.current = abortController;

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
      // Build structured multi-turn conversation history for Gemini
      const history = messages.slice(-10).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.normalizedText }],
      }));

      // Call server-side Gemini chat endpoint with AbortSignal
      const response = await fetch('/api/chat', {
        method: 'POST',
        signal: abortController.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: norm.normalized,
          memory,
          language,
          history,
        }),
      });

      const data = await response.json();

      // If user interrupted during network wait, ignore response
      if (abortController.signal.aborted) {
        return;
      }

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
    } catch (e: any) {
      if (e.name === 'AbortError') {
        // User deliberately interrupted answer production
        const interruptNote: VoiceMessage = {
          id: `kofi-${Date.now()}`,
          sender: 'kofi',
          normalizedText: "(Answer cancelled. I am on standby listening for your next request...)",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, interruptNote]);
        return;
      }

      console.error('Chat error:', e);
      const fallbackMsg: VoiceMessage = {
        id: `kofi-${Date.now()}`,
        sender: 'kofi',
        normalizedText: "I couldn't reach the server right now. Let me know what crop you need and I'll check our local verified listings.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      if (voiceEngineRef.current) {
        if (voiceEngineRef.current.isVoiceActive()) {
          voiceEngineRef.current.setState('standby');
        } else {
          voiceEngineRef.current.setState('idle');
        }
      }
    } finally {
      if (chatAbortControllerRef.current === abortController) {
        chatAbortControllerRef.current = null;
      }
    }
  };

  // Toggle mic: starts continuous standby mode or turns it off; if producing/speaking, interrupts
  const handleToggleMic = () => {
    if (voiceState === 'speaking' || voiceState === 'processing') {
      handleInterrupt();
    } else if (voiceState === 'listening' || voiceState === 'standby') {
      voiceEngineRef.current?.stopListening();
    } else {
      voiceEngineRef.current?.startListening();
    }
  };

  // Interrupt Kofi (both speaking and answer generation)
  const handleInterrupt = () => {
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
      chatAbortControllerRef.current = null;
    }
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

    // Sync with backend orders store
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder),
    }).catch(() => {});

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

    // Sync with backend API
    fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, escrowStatus, note }),
    }).catch(() => {});
  };

  // Add new farmer harvest
  const handleAddHarvest = (newHarvest: HarvestListing) => {
    GHarvestDataManager.addHarvest(newHarvest);
    setHarvests(GHarvestDataManager.getHarvests());

    // Sync with backend API
    fetch('/api/harvests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newHarvest),
    }).catch(() => {});

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
                onInterrupt={handleInterrupt}
              />
            </div>

            {/* Bottom Input Bar for text/voice hybrid */}
            <div className="sticky bottom-3 z-30 pt-3">
              {/* Voice mode state banner */}
              {voiceState !== 'idle' && (
                <div className="mb-2 flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#0c1810]/90 border border-emerald-800/60 backdrop-blur-md shadow-lg text-xs animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-2">
                    {voiceState === 'standby' && (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-emerald-300 font-medium">Standby: Mic open</span>
                        <span className="text-gray-400 hidden sm:inline">— speak whenever you're ready (no rush)</span>
                      </>
                    )}
                    {voiceState === 'listening' && (
                      <>
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                        <span className="text-red-300 font-medium">Hearing you...</span>
                      </>
                    )}
                    {voiceState === 'processing' && (
                      <>
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-spin" />
                        <span className="text-amber-300 font-medium">Producing answer...</span>
                      </>
                    )}
                    {voiceState === 'speaking' && (
                      <>
                        <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                        <span className="text-teal-300 font-medium">Kofi is speaking</span>
                        <span className="text-gray-400 hidden sm:inline">— tap to interrupt</span>
                      </>
                    )}
                    {voiceState === 'interrupted' && (
                      <>
                        <span className="w-2 h-2 rounded-full bg-red-400" />
                        <span className="text-red-300 font-medium">Interrupted</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {(voiceState === 'speaking' || voiceState === 'processing') ? (
                      <button
                        type="button"
                        onClick={handleInterrupt}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/50 text-[11px] font-semibold transition active:scale-95"
                      >
                        <VolumeX className="w-3.5 h-3.5" />
                        Interrupt
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleToggleMic}
                        className="text-[11px] text-gray-400 hover:text-gray-200 transition"
                      >
                        Turn off
                      </button>
                    )}
                  </div>
                </div>
              )}

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
                    voiceState === 'speaking' || voiceState === 'processing'
                      ? 'bg-red-600/90 text-white animate-pulse shadow-lg shadow-red-900/50 hover:bg-red-500'
                      : voiceState === 'listening'
                      ? 'bg-red-500 text-white animate-pulse'
                      : voiceState === 'standby'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50 ring-2 ring-emerald-400/50'
                      : 'bg-emerald-950 text-emerald-400 hover:bg-emerald-900 border border-emerald-800/40'
                  }`}
                  title={
                    voiceState === 'speaking' || voiceState === 'processing'
                      ? 'Interrupt Kofi (Esc)'
                      : voiceState === 'standby'
                      ? 'Mic is on Standby (Click to turn off)'
                      : voiceState === 'listening'
                      ? 'Listening to speech...'
                      : 'Start hands-free voice mode'
                  }
                >
                  {voiceState === 'speaking' || voiceState === 'processing' ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
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
