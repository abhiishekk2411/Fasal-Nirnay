import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  IndianRupee, MapPin, Truck, TrendingUp, CloudRain, Clock, 
  Image as ImageIcon, AlertCircle, Mic, MicOff, Scale, Sprout, 
  Edit2, Send, ArrowRight, Loader2, Check, X, Sparkles, RefreshCw
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import RecommendationCard from '../components/RecommendationCard';
import MetricCard from '../components/MetricCard';
import MandiComparison from '../components/MandiComparison';
import TrendChart from '../components/TrendChart';
import WeatherCard from '../components/WeatherCard';
import { getMarketTrend, analyzeDecision, parseVoiceTranscript } from '../services/decisionService';
import { cropOptions } from '../data/mockData';
import { useTranslation, formatCropName, formatVarietyName, formatMandiName } from '../i18n';

export default function Results() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const initialDecision = location.state?.decision;
  const initialParams = location.state?.searchParams || {};

  const [currentDecision, setCurrentDecision] = useState(initialDecision);
  const [searchParams, setSearchParams] = useState({
    crop: initialParams.crop || initialDecision?.rankedMandis?.[0]?.cropId || 'tomato',
    variety: initialParams.variety || 'hybrid',
    quantityKg: initialParams.quantityKg || 1000,
    quantityQuintals: initialParams.quantityQuintals || (initialParams.quantityKg ? initialParams.quantityKg / 100 : 10),
    location: initialParams.location || initialDecision?.farmerLocation || 'Nashik',
    latitude: initialParams.latitude || null,
    longitude: initialParams.longitude || null
  });

  const [trendData, setTrendData] = useState(null);
  const [trendError, setTrendError] = useState(false);
  const [isReCalculating, setIsReCalculating] = useState(false);
  const [reCalcError, setReCalcError] = useState('');

  // Chip inline edit states
  const [editingChip, setEditingChip] = useState(null); // 'crop' | 'quantity' | 'location' | null

  // Persistent Bottom Mic states
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [followUpText, setFollowUpText] = useState('');
  const [isParsingVoice, setIsParsingVoice] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  const recognitionRef = useRef(null);

  // Setup Web Speech API for persistent bottom mic
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'hi-IN';

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceNotice('');
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
      console.warn('[Results WebSpeech error]:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        setVoiceNotice('माइक्रोफ़ोन अनुमति नहीं मिली।');
      } else if (event.error === 'no-speech') {
        setVoiceNotice('कोई आवाज़ सुनाई नहीं दी।');
      } else {
        setVoiceNotice('आवाज़ सेवा अनुपलब्ध है। नीचे टाइप करें।');
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

  // When bottom mic speech ends with a transcript, parse and recalculate
  useEffect(() => {
    if (!isListening && transcript.trim()) {
      handleVoiceFollowUp(transcript.trim());
    }
  }, [isListening, transcript]);

  // Fetch trend whenever currentDecision changes
  useEffect(() => {
    if (currentDecision && currentDecision.rankedMandis && currentDecision.rankedMandis.length > 0) {
      const fetchTrend = async () => {
        try {
          const bestMandi = currentDecision.rankedMandis.find(m => m.mandiId === currentDecision.bestMandi) || currentDecision.rankedMandis[0];
          const result = await getMarketTrend(bestMandi.cropId || searchParams.crop || 'tomato', bestMandi.mandiId, bestMandi.varietyId || 'hybrid', 30);
          setTrendData(result);
        } catch (err) {
          console.error("Failed to fetch trend:", err);
          setTrendError(true);
        }
      };
      fetchTrend();
    }
  }, [currentDecision]);

  if (!currentDecision) {
    return (
      <div className="page-container flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <AlertCircle size={64} className="text-surface-400" />
        <h2 className="text-2xl font-bold text-surface-700">विश्लेषण का डेटा नहीं मिला</h2>
        <button onClick={() => navigate('/analyze')} className="btn btn-primary btn-lg">
          फसल का दोबारा विश्लेषण करें
        </button>
      </div>
    );
  }

  // Execute recalculation with merged fields in-place
  const reCalculate = async (updatedFields) => {
    setIsReCalculating(true);
    setReCalcError('');
    setVoiceNotice('');

    try {
      const merged = { ...searchParams, ...updatedFields };
      const quantityKg = merged.quantityQuintals != null 
        ? Number(merged.quantityQuintals) * 100 
        : Number(merged.quantityKg) || 1000;

      const newDecision = await analyzeDecision({
        crop: merged.crop.toLowerCase(),
        variety: merged.variety || 'hybrid',
        quantityKg,
        location: merged.location,
        latitude: merged.latitude,
        longitude: merged.longitude
      });

      setCurrentDecision(newDecision);
      setSearchParams({
        ...merged,
        quantityKg,
        quantityQuintals: merged.quantityQuintals || (quantityKg / 100)
      });
      setVoiceNotice('✓ नया मंडी विश्लेषण अपडेट हो गया!');
      setTimeout(() => setVoiceNotice(''), 4000);
    } catch (err) {
      console.error("Re-calculation error:", err);
      setReCalcError(err.message || 'पुनः गणना करने में समस्या आई।');
    } finally {
      setIsReCalculating(false);
    }
  };

  // Parse voice follow-up from bottom bar
  const handleVoiceFollowUp = async (text) => {
    if (!text || !text.trim()) return;

    setIsParsingVoice(true);
    setVoiceNotice('');

    try {
      const parsed = await parseVoiceTranscript(text.trim(), 'hi');
      const updates = {};

      if (parsed.crop) {
        updates.crop = parsed.crop.toLowerCase();
      }

      if (!parsed.needsClarification && parsed.quantityQuintals) {
        updates.quantityQuintals = parsed.quantityQuintals;
      } else if (parsed.needsClarification && parsed.clarificationPromptHindi) {
        setVoiceNotice(parsed.clarificationPromptHindi);
      }

      // Re-run immediately
      await reCalculate(updates);
    } catch (err) {
      console.error("Follow-up Parse Error:", err);
      setVoiceNotice('आवाज़ को प्रोसेस करने में समस्या आई।');
    } finally {
      setIsParsingVoice(false);
      setFollowUpText('');
    }
  };

  const toggleBottomMic = () => {
    if (!recognitionRef.current) {
      setVoiceNotice('इस ब्राउज़र में Speech API उपलब्ध नहीं है।');
      return;
    }

    if (isListening) {
      try { recognitionRef.current.stop(); } catch (e) {}
      setIsListening(false);
    } else {
      setTranscript('');
      setInterimText('');
      setVoiceNotice('');
      try {
        recognitionRef.current.start();
      } catch (e) {
        try {
          recognitionRef.current.abort();
          setTimeout(() => recognitionRef.current.start(), 150);
        } catch (err) {}
      }
    }
  };

  const bestMandiId = currentDecision.bestMandi;
  const bestMandi = currentDecision.rankedMandis.find(m => m.mandiId === bestMandiId) || currentDecision.rankedMandis[0];

  return (
    <div className="page-container space-y-8 animate-slide-up pb-28">
      
      {/* Top Header */}
      <PageHeader 
        title={t('results.title')} 
        subtitle={t('results.subtitle')}
      />

      {/* ======================================================== */}
      {/* Three Editable Confirmation Chips Banner at Top */}
      {/* ======================================================== */}
      <div className="bg-gradient-to-r from-emerald-50 via-primary-50 to-amber-50 p-4 md:p-5 rounded-2xl border-2 border-primary-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-primary-800 flex items-center gap-1.5">
            <Sparkles size={14} className="text-amber-500" />
            <span>सक्रिय फसल विश्लेषण पैरामीटर्स (Active Parameters — Tap Any Chip to Edit & Re-calculate):</span>
          </span>
          {isReCalculating && (
            <span className="text-xs font-bold text-primary-700 flex items-center gap-1.5 animate-pulse">
              <Loader2 size={14} className="animate-spin" />
              <span>पुनः गणना हो रही है...</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          
          {/* Chip 1: Crop */}
          <div 
            onClick={() => setEditingChip(editingChip === 'crop' ? null : 'crop')}
            className="bg-white rounded-xl p-3 border border-emerald-200 shadow-sm hover:border-primary-500 cursor-pointer transition-all flex items-center justify-between"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <Sprout size={18} className="text-emerald-700" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] font-bold uppercase tracking-wider text-surface-400 block">फसल</span>
                {editingChip === 'crop' ? (
                  <select
                    value={searchParams.crop.toLowerCase()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditingChip(null);
                      reCalculate({ crop: val });
                    }}
                    className="text-sm font-bold bg-surface-50 border border-primary-400 rounded p-1 text-primary-800"
                    autoFocus
                  >
                    {cropOptions.map(opt => (
                      <option key={opt} value={opt}>{formatCropName(opt, opt, t)}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-base font-extrabold text-primary-800 block truncate">
                    {formatCropName(searchParams.crop.toLowerCase(), searchParams.crop, t)}
                  </span>
                )}
              </div>
            </div>
            <Edit2 size={14} className="text-surface-400 shrink-0 ml-1" />
          </div>

          {/* Chip 2: Quantity (Quintals) */}
          <div 
            onClick={() => setEditingChip(editingChip === 'quantity' ? null : 'quantity')}
            className="bg-white rounded-xl p-3 border border-amber-200 shadow-sm hover:border-amber-500 cursor-pointer transition-all flex items-center justify-between"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <Scale size={18} className="text-amber-700" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] font-bold uppercase tracking-wider text-surface-400 block">मात्रा</span>
                {editingChip === 'quantity' ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      defaultValue={searchParams.quantityQuintals}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value) || 1;
                        setEditingChip(null);
                        if (val !== searchParams.quantityQuintals) {
                          reCalculate({ quantityQuintals: val });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseFloat(e.target.value) || 1;
                          setEditingChip(null);
                          if (val !== searchParams.quantityQuintals) {
                            reCalculate({ quantityQuintals: val });
                          }
                        }
                      }}
                      className="w-16 text-sm font-bold bg-surface-50 border border-amber-400 rounded p-1"
                      autoFocus
                    />
                    <span className="text-xs font-bold text-surface-600">क्विंटल</span>
                  </div>
                ) : (
                  <span className="text-base font-extrabold text-amber-800 block truncate">
                    {searchParams.quantityQuintals} क्विंटल ({searchParams.quantityQuintals * 100} kg)
                  </span>
                )}
              </div>
            </div>
            <Edit2 size={14} className="text-surface-400 shrink-0 ml-1" />
          </div>

          {/* Chip 3: Location */}
          <div 
            onClick={() => setEditingChip(editingChip === 'location' ? null : 'location')}
            className="bg-white rounded-xl p-3 border border-blue-200 shadow-sm hover:border-blue-500 cursor-pointer transition-all flex items-center justify-between"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <MapPin size={18} className="text-blue-700" />
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] font-bold uppercase tracking-wider text-surface-400 block">स्थान</span>
                {editingChip === 'location' ? (
                  <input
                    type="text"
                    defaultValue={searchParams.location}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      setEditingChip(null);
                      if (val && val !== searchParams.location) {
                        reCalculate({ location: val, latitude: null, longitude: null });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.target.value.trim();
                        setEditingChip(null);
                        if (val && val !== searchParams.location) {
                          reCalculate({ location: val, latitude: null, longitude: null });
                        }
                      }
                    }}
                    className="w-full text-xs font-bold bg-surface-50 border border-blue-400 rounded p-1"
                    autoFocus
                  />
                ) : (
                  <span className="text-base font-extrabold text-blue-800 block truncate" title={searchParams.location}>
                    {searchParams.location}
                  </span>
                )}
              </div>
            </div>
            <Edit2 size={14} className="text-surface-400 shrink-0 ml-1" />
          </div>
        </div>

        {/* Error notification if recalculate failed */}
        {reCalcError && (
          <div className="mt-2 text-xs text-red-600 font-semibold flex items-center gap-1">
            <AlertCircle size={14} />
            <span>{reCalcError}</span>
          </div>
        )}
      </div>

      {/* Recalculating Overlay if in progress */}
      {isReCalculating && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-300 text-amber-900 font-bold text-center flex items-center justify-center gap-2 animate-pulse">
          <Loader2 size={20} className="animate-spin text-amber-600" />
          <span>नई फसल / मात्रा के आधार पर मंडी गणना अपडेट हो रही है...</span>
        </div>
      )}

      {/* Recommendation Banner */}
      <RecommendationCard 
        mandi={bestMandi} 
        tags={currentDecision.reasoningTags} 
        weather={currentDecision.weather}
        allMandis={currentDecision.rankedMandis}
        searchParams={searchParams}
        autoPlay={Boolean(location.state?.fromVoice)}
      />

      {/* Live Weather Forecast & Risk Card */}
      {currentDecision.weather && (
        <WeatherCard weather={currentDecision.weather} />
      )}

      {/* Mandi Comparison */}
      <div>
        <h2 className="section-title mb-4">आसपास की मंडियों की तुलना</h2>
        <MandiComparison mandis={currentDecision.rankedMandis} bestMandiId={bestMandiId} />
      </div>

      {/* Trend Section */}
      <div className="card p-6 md:p-8">
        <h3 className="text-2xl font-bold text-surface-900 mb-6">{t('ux.trendPastDays')}</h3>
        {trendData && trendData.priceHistory ? (
          <>
            <p className="text-lg text-surface-700 leading-relaxed mb-6">
              {bestMandi.trend === 'increasing' ? t('ux.trendIncreasingExp') : bestMandi.trend === 'decreasing' ? t('ux.trendDecreasingExp') : t('ux.trendStableExp')}
            </p>
            <TrendChart data={trendData.priceHistory} title="" />
            <div className="mt-4 pt-4 border-t border-surface-200">
              <p className="font-semibold text-xl">
                अनुमानित भाव: ₹{(trendData.estimatedRange.min).toLocaleString('hi-IN')}–₹{(trendData.estimatedRange.max).toLocaleString('hi-IN')}/kg
              </p>
            </div>
          </>
        ) : trendError ? (
          <div className="flex items-center justify-center h-32 bg-surface-50 rounded-lg text-surface-500 text-lg">
            मंडी भाव का पुराना रिकॉर्ड अभी उपलब्ध नहीं है।
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 bg-surface-50 rounded-lg text-surface-500 text-lg">
            डेटा लोड हो रहा है...
          </div>
        )}
      </div>

      {/* Uploaded Crop Photo Section if present */}
      {(() => {
        const rawImageData = sessionStorage.getItem('fasalnirnay_image_analysis');
        if (!rawImageData) return null;
        try {
          const imgData = JSON.parse(rawImageData);
          if (!imgData || !imgData.imagePreview) return null;

          return (
            <div className="card p-6 md:p-8 animate-fade-in border-2 border-primary-100">
              <h3 className="text-2xl font-bold text-surface-900 mb-6 flex items-center gap-2">
                <span>📷</span> {t('results.uploadedCropPhoto')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div className="w-full max-h-72 rounded-xl overflow-hidden shadow-md border-2 border-surface-200 bg-black flex items-center justify-center">
                  <img src={imgData.imagePreview} alt="Uploaded crop" className="w-full max-h-72 object-contain" />
                </div>
                <div className="space-y-4">
                  <div className="bg-surface-50 p-5 rounded-xl border border-surface-200 space-y-4">
                    <div>
                      <span className="text-sm text-surface-500 font-semibold uppercase tracking-wider block mb-1">
                        🌱 {t('results.detectedCropLabel')}
                      </span>
                      <span className="text-3xl font-extrabold text-primary-700">
                        {formatCropName(imgData.cropId, imgData.cropName, t)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        } catch (e) {
          return null;
        }
      })()}

      {/* ======================================================== */}
      {/* Persistent Bottom Microphone / Follow-Up Bar */}
      {/* ======================================================== */}
      <div className="fixed bottom-3 left-1/2 transform -translate-x-1/2 w-full max-w-3xl px-3 z-50">
        <div className={`rounded-2xl p-3 md:p-3.5 shadow-2xl backdrop-blur-xl border transition-all ${
          isListening 
            ? 'bg-red-950/90 border-red-500/50 ring-4 ring-red-500/30'
            : 'bg-surface-900/90 border-white/20'
        }`}>
          
          <div className="flex items-center gap-2 md:gap-3">
            
            {/* Mic Push-to-Talk Button */}
            <button
              type="button"
              onClick={toggleBottomMic}
              disabled={isReCalculating || isParsingVoice}
              className={`relative shrink-0 flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full transition-transform active:scale-95 shadow-md cursor-pointer ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-primary-500 hover:bg-primary-400 text-white'
              }`}
              title={isListening ? 'रोकें' : 'बोलकर बदलें (उदा. प्याज कर दो)'}
            >
              {isListening ? (
                <MicOff size={24} className="animate-bounce" />
              ) : isParsingVoice ? (
                <Loader2 size={24} className="animate-spin text-white" />
              ) : (
                <Mic size={24} />
              )}
            </button>

            {/* Middle Content: Live Transcript or Fallback Input Form */}
            <div className="flex-1 overflow-hidden">
              {isListening ? (
                <div className="text-left">
                  <span className="text-[11px] uppercase tracking-wider text-red-300 font-bold block flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-ping"></span>
                    सुन रहे हैं... बोलिए (उदा. "pyaaz kar do", "30 quintal"):
                  </span>
                  <p className="text-sm md:text-base font-bold text-amber-200 truncate">
                    "{transcript || interimText || 'बोलिए...'}"
                  </p>
                </div>
              ) : (
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (followUpText.trim()) {
                      handleVoiceFollowUp(followUpText.trim());
                    }
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={followUpText}
                    onChange={(e) => setFollowUpText(e.target.value)}
                    placeholder="बोलें या लिखें: 'pyaaz kar do', '30 quintal', 'aloo'..."
                    disabled={isReCalculating || isParsingVoice}
                    className="w-full bg-white/10 hover:bg-white/15 focus:bg-white/20 text-white placeholder-white/50 text-xs md:text-sm rounded-xl px-3 py-2.5 focus:outline-none border border-white/10 focus:border-white/30 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!followUpText.trim() || isReCalculating || isParsingVoice}
                    className="p-2.5 rounded-xl bg-amber-400 text-surface-950 hover:bg-amber-300 disabled:opacity-40 transition-all font-bold shrink-0 cursor-pointer shadow-md"
                  >
                    <Send size={16} />
                  </button>
                </form>
              )}
            </div>

            {/* Quick Chips */}
            <div className="hidden lg:flex items-center gap-1.5 shrink-0 border-l border-white/15 pl-2">
              <span className="text-[10px] text-white/50 uppercase font-bold">क्विक:</span>
              {['pyaaz kar do', '30 quintal', 'aloo'].map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleVoiceFollowUp(chip)}
                  disabled={isReCalculating || isParsingVoice}
                  className="text-xs px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 border border-white/10 transition-colors cursor-pointer"
                >
                  "{chip}"
                </button>
              ))}
            </div>
          </div>

          {/* Voice Notice / Clarification Banner */}
          {voiceNotice && (
            <div className="mt-2 text-xs md:text-sm font-semibold text-amber-300 text-center flex items-center justify-center gap-1.5 animate-fade-in">
              <span>💡</span>
              <span>{voiceNotice}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
