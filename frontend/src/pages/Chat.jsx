import React, { useState, useRef, useEffect } from 'react';
import { Bot, Volume2, VolumeX, Sparkles } from 'lucide-react';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { chatSuggestions } from '../services/chatService';
import { sendChatMessage } from '../services/chatService';
import { useTranslation } from '../i18n';

export default function Chat() {
  const { t, lang } = useTranslation();

  const getInitialMessages = () => [
    {
      id: 'c1',
      sender: 'user',
      text: t('chatMsg.msg1') || 'मेरे पास टमाटर की फसल है। मुझे कहाँ बेचना चाहिए?',
      timestamp: '10:30 AM',
    },
    {
      id: 'c2',
      sender: 'assistant',
      text: t('chatMsg.msg2') || 'नमस्ते किसान भाई! मैं फसल सहायक हूँ। आपकी फसल की मात्रा और स्थान के अनुसार कम परिवहन खर्च और मौसम के जोखिम को घटाकर सबसे ज़्यादा शुद्ध मुनाफा देने वाली मंडी बताने के लिए तैयार हूँ। आप क्या जानना चाहते हैं?',
      timestamp: '10:30 AM',
    },
  ];

  const [messages, setMessages] = useState(getInitialMessages);
  const [isTyping, setIsTyping] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);

  const messagesEndRef = useRef(null);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  // Preferred Voice Selection (hi-IN -> en-IN -> default)
  const getPreferredVoice = () => {
    if (!synthRef.current) return null;
    const voices = synthRef.current.getVoices();
    if (!voices || voices.length === 0) return null;

    const hiVoice = voices.find(v => v.lang === 'hi-IN' || v.lang.toLowerCase().startsWith('hi'));
    if (hiVoice) return hiVoice;

    const enInVoice = voices.find(v => v.lang === 'en-IN');
    if (enInVoice) return enInVoice;

    return voices.find(v => v.default) || voices[0] || null;
  };

  const handleSpeakMessage = (text, messageId = null) => {
    if (!synthRef.current) return;

    if (speakingMessageId === messageId && messageId !== null) {
      synthRef.current.cancel();
      setSpeakingMessageId(null);
      return;
    }

    synthRef.current.cancel();

    // Clean markdown asterisks or special characters for voice playback
    const cleanSpeech = text.replace(/[*#_~`]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanSpeech);

    const voice = getPreferredVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = lang === 'en' ? 'en-IN' : 'hi-IN';
    }

    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setSpeakingMessageId(messageId);
    };

    utterance.onend = () => {
      setSpeakingMessageId(null);
    };

    utterance.onerror = () => {
      setSpeakingMessageId(null);
    };

    synthRef.current.speak(utterance);
  };

  const handleSend = async (text) => {
    if (!text.trim()) return;

    const userMsg = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsTyping(true);

    try {
      const response = await sendChatMessage(text, updatedMessages, lang);
      setMessages([...updatedMessages, response]);

      // Automatically speak assistant response if speaking helper is enabled
      if (autoSpeak && response && response.text) {
        handleSpeakMessage(response.text, response.id);
      }
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsTyping(false);
    }
  };

  // Translation mapping for suggestion buttons to prevent raw key leak
  const getSuggestionText = (key) => {
    const direct = t(`suggestions.${key}`);
    if (direct && direct !== `suggestions.${key}`) return direct;
    
    const fallbackMap = {
      bestMandi: 'मेरी फसल के लिए सबसे अच्छी मंडी कौन सी है?',
      sellNow: 'क्या मुझे अभी बेचना चाहिए या इंतज़ार करना चाहिए?',
      nearbyPrices: 'आस-पास के ताज़ा मंडी भाव दिखाएं',
      weatherRisk: 'क्या बारिश या मौसम से फसल को कोई जोखिम है?',
      compareAll: 'सभी मंडियों की तुलना करके मुनाफा बताएं'
    };

    return fallbackMap[key] || key;
  };

  return (
    <div className="page-container h-[calc(100vh-80px)] flex flex-col animate-fade-in">
      
      {/* Header Card with Speaking Helper Toggle */}
      <div className="card p-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-sm border border-primary-100 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary-100 rounded-2xl flex items-center justify-center text-primary-700 shadow-sm border border-primary-200 shrink-0">
            <Bot size={28} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-surface-900 flex items-center gap-2">
              <span>{t('chat.title', 'फसल सहायक (AI Crop Assistant)')}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                OpenRouter AI
              </span>
            </h1>
            <p className="text-surface-500 text-xs md:text-sm">
              {t('chat.subtitle', 'भाव, मंडी या कब बेचना है — कुछ भी पूछें।')}
            </p>
          </div>
        </div>

        {/* Speaking Helper Toggle */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => {
              if (autoSpeak && synthRef.current) {
                synthRef.current.cancel();
                setSpeakingMessageId(null);
              }
              setAutoSpeak(!autoSpeak);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs md:text-sm transition-all border cursor-pointer ${
              autoSpeak 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-sm ring-1 ring-emerald-300' 
                : 'bg-surface-100 text-surface-500 border-surface-200'
            }`}
            title="बोलकर जवाब देने की सुविधा को चालू या बंद करें"
          >
            {autoSpeak ? (
              <>
                <Volume2 size={16} className="text-emerald-700 animate-pulse" />
                <span>बोलकर जवाब: चालू (Voice ON)</span>
              </>
            ) : (
              <>
                <VolumeX size={16} className="text-surface-400" />
                <span>बोलकर जवाब: बंद (Voice OFF)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto mb-4 bg-surface-50 rounded-2xl p-4 shadow-inner border border-surface-200">
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.map((msg) => (
            <ChatMessage 
              key={msg.id} 
              message={msg} 
              onSpeak={handleSpeakMessage}
              isSpeaking={speakingMessageId === msg.id}
            />
          ))}

          {isTyping && (
            <div className="flex items-center gap-2 p-3 bg-white rounded-2xl shadow-sm border border-surface-200 w-max text-primary-700 text-sm font-semibold animate-pulse">
              <Bot size={16} />
              <span>फसल सहायक सोच रहे हैं...</span>
              <span className="flex gap-1 ml-1">
                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Quick Suggestion Chips */}
      <div className="shrink-0 mb-3 overflow-x-auto whitespace-nowrap pb-1 scrollbar-hide">
        <div className="flex gap-2 max-w-3xl mx-auto">
          {chatSuggestions && chatSuggestions.map((suggestionKey, idx) => {
            const label = getSuggestionText(suggestionKey);
            return (
              <button
                key={idx}
                onClick={() => handleSend(label)}
                disabled={isTyping}
                className="px-3.5 py-1.5 bg-white border border-primary-200 text-primary-800 rounded-full text-xs md:text-sm font-bold hover:bg-primary-50 hover:border-primary-400 transition-all shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Input Form with Push-to-Talk Mic */}
      <div className="shrink-0 max-w-3xl mx-auto w-full">
        <ChatInput onSend={handleSend} disabled={isTyping} />
      </div>
    </div>
  );
}
