import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Sparkles, X, Check, Edit2, MapPin, Scale, Sprout, AlertCircle, ArrowRight, Loader2, Pause, Play } from 'lucide-react';
import { parseVoiceTranscript } from '../services/decisionService';
import { cropOptions } from '../data/mockData';
import { useTranslation, formatCropName } from '../i18n';

export default function VoiceHeroCard({
  detectedLocation = '',
  latitude = null,
  longitude = null,
  onAnalyze,
  onUpdateFormData,
  isAnalyzing = false
}) {
  const { t } = useTranslation();

  // Voice recognition states
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [fallbackInput, setFallbackInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [voiceError, setVoiceError] = useState('');

  // Parsed confirmation chips
  const [parsedData, setParsedData] = useState(null);
  const [clarificationNotice, setClarificationNotice] = useState(null);
  const [editingChip, setEditingChip] = useState(null); // 'crop' | 'quantity' | 'location' | null

  // Auto-run 1.5-second countdown timer
  const [countdown, setCountdown] = useState(null); // remaining milliseconds (1500 -> 0)
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);

  // Setup Web Speech API
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'hi-IN';

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceError('');
      setTranscript('');
      setInterimText('');
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const item = event.results[i];
        if (item.isFinal) {
          final += item[0].transcript;
        } else {
          interim += item[0].transcript;
        }
      }
      setInterimText(interim);
      if (final) {
        setTranscript(final);
      }
    };

    recognition.onerror = (event) => {
      console.warn('[WebSpeech error]:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        setVoiceError('माइक्रोफ़ोन अनुमति नहीं मिली। नीचे दिए गए टेक्स्ट बॉक्स का उपयोग करें। (Microphone permission denied)');
      } else if (event.error === 'no-speech') {
        setVoiceError('कोई आवाज़ सुनाई नहीं दी। कृपया दोबारा बोलें। (No speech detected)');
      } else if (event.error === 'network') {
        setVoiceError('आवाज़ सेवा से संपर्क नहीं हो पाया। नीचे लिखकर या टेस्ट बटन दबाकर कोशिश करें।');
      } else {
        setVoiceError('आवाज़ पहचानने में समस्या आई। नीचे बॉक्स में लिखकर पूछें।');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
    };
  }, []);

  // When speech stops and we have transcript, send to backend parser
  useEffect(() => {
    if (!isListening && transcript.trim()) {
      handleParseVoice(transcript.trim());
    }
  }, [isListening, transcript]);

  // Handle countdown interval
  useEffect(() => {
    if (countdown === null || isPaused) return;

    if (countdown <= 0) {
      // Trigger calculation
      handleProceedToAnalyze();
      setCountdown(null);
      return;
    }

    timerRef.current = setTimeout(() => {
      setCountdown(prev => Math.max(0, prev - 100));
    }, 100);

    return () => clearTimeout(timerRef.current);
  }, [countdown, isPaused]);

  const toggleListening = () => {
    setVoiceError('');
    if (!recognitionRef.current) {
      setVoiceError('इस ब्राउज़र में Speech API उपलब्ध नहीं है। कृपया नीचे लिखकर दर्ज करें।');
      return;
    }

    if (isListening) {
      try { recognitionRef.current.stop(); } catch (e) {}
      setIsListening(false);
    } else {
      // Clear previous parsed state
      setParsedData(null);
      setClarificationNotice(null);
      setCountdown(null);
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.warn('Speech start error:', err);
        try {
          recognitionRef.current.abort();
          setTimeout(() => recognitionRef.current.start(), 150);
        } catch (e) {
          setVoiceError('माइक शुरू करने में समस्या आई।');
        }
      }
    }
  };

  // Process transcript with backend POST /api/voice/parse
  const handleParseVoice = async (textToParse) => {
    if (!textToParse || !textToParse.trim()) return;

    setIsParsing(true);
    setVoiceError('');
    setClarificationNotice(null);
    setCountdown(null);

    try {
      const response = await parseVoiceTranscript(textToParse.trim(), 'hi');
      
      const parsedCrop = response.crop || 'Tomato';
      const parsedQuantity = response.quantityQuintals || 1;
      const currentLoc = detectedLocation || 'Nashik, Maharashtra';

      const structured = {
        crop: parsedCrop,
        quantityQuintals: parsedQuantity,
        location: currentLoc,
        latitude,
        longitude,
        confidence: response.confidence
      };

      setParsedData(structured);

      if (response.needsClarification && response.clarificationPromptHindi) {
        setClarificationNotice(response.clarificationPromptHindi);
      }

      // Sync with parent manual form
      if (onUpdateFormData) {
        onUpdateFormData({
          crop: parsedCrop.toLowerCase(),
          quantity: parsedQuantity * 100, // in kg
          unit: 'quintal',
          quantityQuintals: parsedQuantity,
          location: currentLoc,
          latitude,
          longitude
        });
      }

      // Start 1.5-second countdown to auto-navigate
      setIsPaused(false);
      setCountdown(1500);
    } catch (err) {
      console.error('Voice Parse Error:', err);
      setVoiceError('आवाज़ को प्रोसेस करने में समस्या आई। कृपया नीचे दोबारा प्रयास करें।');
    } finally {
      setIsParsing(false);
    }
  };

  const handleCancelCountdown = () => {
    setIsPaused(true);
    setCountdown(null);
  };

  const handleProceedToAnalyze = () => {
    if (!parsedData || !onAnalyze) return;
    setCountdown(null);
    onAnalyze({
      crop: parsedData.crop.toLowerCase(),
      variety: 'hybrid',
      quantityKg: parsedData.quantityQuintals * 100,
      quantityQuintals: parsedData.quantityQuintals,
      unit: 'quintal',
      location: parsedData.location || detectedLocation,
      latitude: parsedData.latitude || latitude,
      longitude: parsedData.longitude || longitude
    });
  };

  const handleChipChange = (field, value) => {
    setParsedData(prev => {
      const updated = { ...prev, [field]: value };
      if (onUpdateFormData) {
        onUpdateFormData({
          [field]: field === 'quantityQuintals' ? Number(value) * 100 : value,
          ...(field === 'crop' ? { crop: value.toLowerCase() } : {}),
          ...(field === 'quantityQuintals' ? { quantityQuintals: Number(value), unit: 'quintal' } : {})
        });
      }
      return updated;
    });
  };

  const quickDemoPhrases = [
    '20 quintal tamatar',
    '40 bori kanda',
    '1 bori aaloo',
    '1 ton gehu',
    'tamatar ka rate kya hai'
  ];

  return (
    <div className="mb-8">
      {/* Hero Card Container */}
      <div className={`relative overflow-hidden rounded-3xl p-6 md:p-8 transition-all shadow-xl ${
        isListening 
          ? 'bg-gradient-to-br from-red-600 via-rose-600 to-amber-700 text-white ring-4 ring-red-300 animate-pulse'
          : 'bg-gradient-to-br from-primary-800 via-primary-700 to-emerald-900 text-white shadow-primary-900/20'
      }`}>
        {/* Background decorative elements */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-48 h-48 bg-emerald-400/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-center text-center">
          
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs md:text-sm font-semibold tracking-wide uppercase mb-4 text-emerald-200 border border-white/20">
            <Sparkles size={14} className="text-amber-300" />
            <span>आवाज़ से तुरंत पूछें / Voice-First Assistant</span>
          </div>

          {/* Hindi Prompt Header */}
          <h2 className="text-2xl md:text-3xl font-extrabold font-serif mb-2 leading-tight max-w-xl">
            "बोलिए: मेरे पास 20 क्विंटल टमाटर है, कहाँ बेचूँ?"
          </h2>
          <p className="text-sm md:text-base text-white/80 mb-6 max-w-lg">
            अपनी भाषा में फसल और मात्रा बोलें। हमारा AI सबसे ज्यादा मुनाफा देने वाली मंडी तुरंत ढूँढ निकालेगा।
          </p>

          {/* Large Push-to-Talk Microphone Button */}
          <div className="relative my-2">
            {isListening && (
              <>
                <span className="absolute -inset-4 rounded-full bg-red-400 opacity-75 animate-ping"></span>
                <span className="absolute -inset-8 rounded-full bg-red-500 opacity-40 animate-pulse"></span>
              </>
            )}

            <button
              type="button"
              onClick={toggleListening}
              disabled={isParsing || isAnalyzing}
              className={`relative z-10 flex items-center justify-center w-24 h-24 md:w-28 md:h-28 rounded-full transition-transform transform active:scale-95 shadow-2xl focus:outline-none cursor-pointer ${
                isListening
                  ? 'bg-white text-red-600 ring-8 ring-white/40'
                  : 'bg-white text-primary-700 hover:bg-emerald-50 hover:scale-105 ring-8 ring-white/20'
              }`}
              title={isListening ? 'बोलना बंद करें' : 'माइक दबाकर बोलें'}
            >
              {isListening ? (
                <div className="flex flex-col items-center justify-center">
                  <div className="w-8 h-8 rounded-md bg-red-600 animate-pulse mb-1 flex items-center justify-center">
                    <MicOff size={20} className="text-white" />
                  </div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-600">रोकें</span>
                </div>
              ) : isParsing ? (
                <Loader2 size={36} className="animate-spin text-primary-600" />
              ) : (
                <div className="flex flex-col items-center justify-center">
                  <Mic size={36} className="text-primary-600 mb-1" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-primary-700">बोलें</span>
                </div>
              )}
            </button>
          </div>

          {/* Status Label */}
          <div className="mt-3 text-sm md:text-base font-semibold">
            {isListening ? (
              <span className="text-white flex items-center justify-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping"></span>
                सुन रहे हैं... बोलिए (Listening...)
              </span>
            ) : isParsing ? (
              <span className="text-emerald-200 flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                आवाज़ को प्रोसेस किया जा रहा है...
              </span>
            ) : (
              <span className="text-white/80">माइक दबाएँ और बोलें (Tap Mic to Speak)</span>
            )}
          </div>

          {/* Live Interim Transcript Display */}
          {(interimText || transcript) && (
            <div className="mt-4 w-full max-w-lg p-3 rounded-2xl bg-black/25 backdrop-blur-md border border-white/20 text-center animate-fade-in">
              <span className="text-xs uppercase tracking-wider text-white/60 block mb-1">आपकी आवाज़ (Live Transcript):</span>
              <p className="text-lg md:text-xl font-bold text-amber-200">
                "{transcript || interimText}"
              </p>
            </div>
          )}

          {/* Error Notice */}
          {voiceError && (
            <div className="mt-4 max-w-md p-3 rounded-xl bg-red-500/80 text-white text-xs md:text-sm border border-red-300 flex items-center gap-2 animate-shake">
              <AlertCircle size={18} className="shrink-0" />
              <span>{voiceError}</span>
            </div>
          )}

          {/* Clarification Notice Banner (e.g. Missing Quantity) */}
          {clarificationNotice && (
            <div className="mt-4 max-w-lg p-3 rounded-xl bg-amber-400 text-surface-900 font-medium text-sm md:text-base border border-amber-300 shadow-md flex items-center gap-2 animate-bounce-short">
              <span className="text-xl">💡</span>
              <span>{clarificationNotice}</span>
            </div>
          )}

          {/* Fallback Voice-Text Input Bar (For blocked mic permissions or quick text) */}
          <div className="mt-6 w-full max-w-xl">
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (fallbackInput.trim()) {
                  handleParseVoice(fallbackInput.trim());
                }
              }}
              className="flex items-center gap-2 bg-white/10 backdrop-blur-md p-1.5 rounded-full border border-white/25 focus-within:border-white focus-within:bg-white/20 transition-all shadow-inner"
            >
              <input
                type="text"
                value={fallbackInput}
                onChange={(e) => setFallbackInput(e.target.value)}
                placeholder="या यहाँ बोलकर/लिखकर दर्ज करें (उदा. 20 quintal tamatar)..."
                className="flex-1 bg-transparent px-4 py-2 text-white placeholder-white/60 text-sm md:text-base focus:outline-none"
              />
              <button
                type="submit"
                disabled={!fallbackInput.trim() || isParsing}
                className="p-2.5 rounded-full bg-white text-primary-800 hover:bg-emerald-50 disabled:opacity-40 transition-all cursor-pointer font-bold shadow-md"
                title="पार्स करें"
              >
                <ArrowRight size={18} />
              </button>
            </form>

            {/* Quick Demo Voice Test Chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              <span className="text-xs text-white/70">क्विक टेस्ट:</span>
              {quickDemoPhrases.map((phrase, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setFallbackInput(phrase);
                    handleParseVoice(phrase);
                  }}
                  className="text-xs px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/30 text-white font-medium border border-white/20 transition-colors cursor-pointer"
                >
                  "{phrase}"
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* Three Large Editable Confirmation Chips + 1.5s Auto-run */}
        {/* ======================================================== */}
        {parsedData && (
          <div className="mt-8 pt-6 border-t border-white/20 animate-slide-up">
            <div className="text-center mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300 block mb-1">
                ✓ पुष्टि करें / Confirm Spoken Details
              </span>
              <p className="text-sm text-white/80">
                नीचे दिए गए किसी भी चिप को दबाकर विवरण बदल सकते हैं:
              </p>
            </div>

            {/* Three Large Confirmation Chips Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl mx-auto">
              
              {/* Chip 1: Crop */}
              <div 
                onClick={() => setEditingChip(editingChip === 'crop' ? null : 'crop')}
                className="relative bg-white text-surface-900 rounded-2xl p-4 shadow-lg border-2 border-emerald-300 cursor-pointer hover:border-emerald-500 transition-all group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-surface-500 uppercase flex items-center gap-1">
                    <Sprout size={14} className="text-primary-600" />
                    <span>फसल (Crop)</span>
                  </span>
                  <Edit2 size={14} className="text-surface-400 group-hover:text-primary-600" />
                </div>
                
                {editingChip === 'crop' ? (
                  <select
                    value={parsedData.crop.toLowerCase()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleChipChange('crop', val.charAt(0).toUpperCase() + val.slice(1));
                      setEditingChip(null);
                    }}
                    className="w-full text-base font-bold bg-surface-50 border border-primary-300 rounded-lg p-1 text-primary-800"
                    autoFocus
                  >
                    {cropOptions.map(opt => (
                      <option key={opt} value={opt}>{formatCropName(opt, opt, t)}</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xl md:text-2xl font-black text-primary-700">
                    {formatCropName(parsedData.crop.toLowerCase(), parsedData.crop, t)}
                  </div>
                )}
              </div>

              {/* Chip 2: Quantity in Quintals */}
              <div 
                onClick={() => setEditingChip(editingChip === 'quantity' ? null : 'quantity')}
                className="relative bg-white text-surface-900 rounded-2xl p-4 shadow-lg border-2 border-emerald-300 cursor-pointer hover:border-emerald-500 transition-all group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-surface-500 uppercase flex items-center gap-1">
                    <Scale size={14} className="text-amber-600" />
                    <span>मात्रा (Quantity)</span>
                  </span>
                  <Edit2 size={14} className="text-surface-400 group-hover:text-amber-600" />
                </div>

                {editingChip === 'quantity' ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      defaultValue={parsedData.quantityQuintals}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value) || 1;
                        handleChipChange('quantityQuintals', val);
                        setEditingChip(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseFloat(e.target.value) || 1;
                          handleChipChange('quantityQuintals', val);
                          setEditingChip(null);
                        }
                      }}
                      className="w-20 text-base font-bold bg-surface-50 border border-amber-300 rounded-lg p-1"
                      autoFocus
                    />
                    <span className="text-xs font-bold text-surface-600">क्विंटल</span>
                  </div>
                ) : (
                  <div className="text-xl md:text-2xl font-black text-amber-700">
                    {parsedData.quantityQuintals} <span className="text-base font-bold text-surface-600">क्विंटल ({parsedData.quantityQuintals * 100} kg)</span>
                  </div>
                )}
              </div>

              {/* Chip 3: Location */}
              <div 
                onClick={() => setEditingChip(editingChip === 'location' ? null : 'location')}
                className="relative bg-white text-surface-900 rounded-2xl p-4 shadow-lg border-2 border-emerald-300 cursor-pointer hover:border-emerald-500 transition-all group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-surface-500 uppercase flex items-center gap-1">
                    <MapPin size={14} className="text-blue-600" />
                    <span>स्थान (Location)</span>
                  </span>
                  <Edit2 size={14} className="text-surface-400 group-hover:text-blue-600" />
                </div>

                {editingChip === 'location' ? (
                  <input
                    type="text"
                    defaultValue={parsedData.location}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      handleChipChange('location', e.target.value);
                      setEditingChip(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleChipChange('location', e.target.value);
                        setEditingChip(null);
                      }
                    }}
                    className="w-full text-sm font-bold bg-surface-50 border border-blue-300 rounded-lg p-1"
                    autoFocus
                  />
                ) : (
                  <div className="text-lg md:text-xl font-bold text-blue-800 truncate" title={parsedData.location}>
                    {parsedData.location || 'लाइव GPS'}
                  </div>
                )}
              </div>
            </div>

            {/* Countdown & Action Bar */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-black/25 backdrop-blur-md p-4 rounded-2xl border border-white/20 max-w-3xl mx-auto">
              
              <div className="flex items-center gap-3">
                {countdown !== null && countdown > 0 ? (
                  <div className="flex items-center gap-2">
                    <div className="relative w-10 h-10 flex items-center justify-center">
                      <svg className="w-10 h-10 transform -rotate-90">
                        <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" className="text-white/20" fill="transparent" />
                        <circle
                          cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3"
                          className="text-amber-400 transition-all duration-100"
                          fill="transparent"
                          strokeDasharray={100}
                          strokeDashoffset={100 - (countdown / 1500) * 100}
                        />
                      </svg>
                      <span className="absolute text-xs font-bold text-amber-300">
                        {(countdown / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <div>
                      <span className="font-bold text-sm text-white block">
                        परिणाम लोड हो रहे हैं...
                      </span>
                      <span className="text-xs text-white/70">
                        (Auto-calculating in {(countdown / 1000).toFixed(1)}s)
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-sm font-semibold text-emerald-200">
                    विवरण तैयार है। तुरंत मंडी परिणाम देखें।
                  </span>
                )}
              </div>

              {/* Action Buttons: Pause/Cancel vs Go Now */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {countdown !== null && countdown > 0 && (
                  <button
                    type="button"
                    onClick={handleCancelCountdown}
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-sm transition-all border border-white/30 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Pause size={16} />
                    <span>रुकें / बदलें (Cancel / Edit)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleProceedToAnalyze}
                  disabled={isAnalyzing}
                  className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-surface-900 font-extrabold text-sm md:text-base transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>विश्लेषण हो रहा है...</span>
                    </>
                  ) : (
                    <>
                      <span>मंडी परिणाम देखें</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
