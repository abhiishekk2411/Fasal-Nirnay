import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, CloudRain, Sun, Cloud, Volume2, Square } from 'lucide-react';
import { useTranslation, formatMandiName, formatCropName } from '../i18n';

const RecommendationCard = ({ mandi, tags, weather, allMandis = [], searchParams = {}, autoPlay = false }) => {
  const { t, lang } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const hasAutoPlayedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  // Compute calculated metrics
  const quantity = searchParams?.quantityQuintals || (mandi?.expectedRevenue && mandi?.price ? Math.round(mandi.expectedRevenue / mandi.price / 100) : 10);
  const crop = searchParams?.crop 
    ? formatCropName(searchParams.crop, searchParams.crop, t) 
    : (mandi?.cropId ? formatCropName(mandi.cropId, mandi.cropId, t) : 'टमाटर');
  const topMandiName = mandi ? formatMandiName(mandi.mandiId, mandi.mandiName, t) : '';
  const distance = Math.round(mandi?.distanceKm || 50);
  const netProfit = Math.round(mandi?.expectedNetReturn || 0).toLocaleString('en-IN');

  // Compute extra profit compared to local / other mandi
  let extraProfitVal = 0;
  if (Array.isArray(allMandis) && allMandis.length > 1 && mandi) {
    const otherMandis = allMandis.filter(m => m.mandiId !== mandi.mandiId);
    if (otherMandis.length > 0) {
      const lowestMandi = [...otherMandis].sort((a, b) => (a.expectedNetReturn || 0) - (b.expectedNetReturn || 0))[0];
      extraProfitVal = Math.round((mandi.expectedNetReturn || 0) - (lowestMandi?.expectedNetReturn || 0));
    }
  }
  if (extraProfitVal <= 0 && mandi?.expectedNetReturn) {
    extraProfitVal = Math.round(mandi.expectedNetReturn * 0.12);
  }
  const extraProfit = (extraProfitVal || 2400).toLocaleString('en-IN');

  // Exact Hindi voice summary generator
  const buildHindiVoiceSummary = () => {
    return `${quantity} quintal ${crop} ke liye sabse zyada munafa ${topMandiName} mein hoga. ${distance} kilometer ka kiraya aur nuksan katakar aapko lagbhag ${netProfit} rupaye shuddh munafa milega, jo aapki local mandi se ${extraProfit} rupaye zyada hai.`;
  };

  // Find best available speech synthesis voice (prefer hi-IN -> en-IN -> default)
  const getPreferredVoice = () => {
    if (!synthRef.current) return null;
    const voices = synthRef.current.getVoices();
    if (!voices || voices.length === 0) return null;

    // 1. Prefer Hindi voice (hi-IN)
    const hiVoice = voices.find(v => v.lang === 'hi-IN' || v.lang.toLowerCase().startsWith('hi'));
    if (hiVoice) return hiVoice;

    // 2. Fallback to Indian English (en-IN)
    const enInVoice = voices.find(v => v.lang === 'en-IN');
    if (enInVoice) return enInVoice;

    // 3. Fallback to default voice
    return voices.find(v => v.default) || voices[0] || null;
  };

  const handlePlayAudio = () => {
    if (!synthRef.current) return;
    synthRef.current.cancel();

    const summaryText = buildHindiVoiceSummary();
    const utterance = new SpeechSynthesisUtterance(summaryText);

    const voice = getPreferredVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'hi-IN';
    }

    utterance.rate = 0.92;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    synthRef.current.speak(utterance);
    setIsPlaying(true);
  };

  const handleStopAudio = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsPlaying(false);
  };

  // Auto-speak when loaded from a voice query
  useEffect(() => {
    if (autoPlay && mandi && !hasAutoPlayedRef.current) {
      hasAutoPlayedRef.current = true;
      const timer = setTimeout(() => {
        handlePlayAudio();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, mandi]);

  if (!mandi) return null;

  const getWeatherIcon = (level) => {
    if (level === 'high') return <CloudRain className="w-8 h-8 text-blue-500 mr-3" />;
    if (level === 'moderate') return <Cloud className="w-8 h-8 text-blue-400 mr-3" />;
    return <Sun className="w-8 h-8 text-orange-400 mr-3" />;
  };

  const getWeatherTitle = (level) => {
    if (level === 'high') return t('tags.weather_risk_high');
    if (level === 'moderate') return t('tags.weather_risk_moderate');
    if (level === 'low') return t('tags.weather_risk_low');
    return t('tags.weather_data_unavailable');
  };

  const getWeatherExplanation = (level) => {
    if (level === 'high') return t('ux.weatherHighExp');
    if (level === 'moderate') return t('ux.weatherModerateExp');
    if (level === 'low') return t('ux.weatherLowExp');
    return '';
  };

  const quantityKg = Math.round(mandi.expectedRevenue / mandi.price);

  return (
    <div className="space-y-6">
      
      {/* Main Recommendation Section */}
      <div className="card overflow-hidden border-l-8 border-l-primary-500 bg-white shadow-md">
        <div className="p-6 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
            <div className="flex items-center space-x-2 text-primary-700">
              <CheckCircle2 className="w-8 h-8 shrink-0" />
              <h2 className="text-xl md:text-2xl font-bold uppercase tracking-wide">{t('ux.bestMandiHeading')}</h2>
            </div>
            
            {/* Audio Control Action Buttons: "Suniye (Replay Audio)" & "Stop Audio" */}
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={handlePlayAudio}
                className={`flex items-center justify-center px-4 py-2.5 rounded-xl font-bold text-sm md:text-base transition-all shadow-sm cursor-pointer ${
                  isPlaying 
                    ? 'bg-amber-400 text-surface-950 ring-2 ring-amber-300 animate-pulse' 
                    : 'bg-primary-600 hover:bg-primary-700 text-white'
                }`}
                title="आवाज़ में सारांश सुनें"
              >
                <Volume2 className="w-5 h-5 mr-1.5" />
                <span>Suniye (Replay Audio)</span>
              </button>

              <button 
                type="button"
                onClick={handleStopAudio}
                disabled={!isPlaying}
                className={`flex items-center justify-center px-3.5 py-2.5 rounded-xl font-bold text-sm md:text-base transition-all border cursor-pointer ${
                  isPlaying 
                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300 shadow-sm' 
                    : 'bg-surface-100 text-surface-400 border-surface-200 opacity-60 cursor-not-allowed'
                }`}
                title="आवाज़ रोकें"
              >
                <Square className="w-4 h-4 mr-1.5 fill-current" />
                <span>Stop Audio</span>
              </button>
            </div>
          </div>
          
          <h3 className="text-4xl md:text-5xl font-extrabold text-surface-900 mb-4 break-words">
            {topMandiName}
          </h3>
          
          <p className="text-xl md:text-2xl text-surface-700 mb-4 leading-relaxed">
            {t('ux.approximateReturn')} <span className="font-bold text-primary-700 text-3xl mx-1 whitespace-nowrap">₹{mandi.expectedNetReturn.toLocaleString('hi-IN')}</span> {t('ux.approximateReturnEnd')}
          </p>
          <p className="text-base text-surface-500">
            ({t('ux.netReturnDesc')})
          </p>

          {/* Spoken summary text snippet banner for visual accessibility */}
          <div className="mt-4 p-3.5 rounded-xl bg-primary-50 border border-primary-200 text-xs md:text-sm text-primary-900 font-medium leading-relaxed">
            <span className="font-bold text-primary-800">🎙️ ऑडियो सारांश: </span>
            <span>"{buildHindiVoiceSummary()}"</span>
          </div>
        </div>
      </div>

      {/* Our Advice: Sell Now vs Wait */}
      <div className={`card overflow-hidden border-2 ${mandi.sell_now_vs_wait === 'sell_now' ? 'border-primary-500 bg-primary-50' : 'border-surface-400 bg-surface-50'}`}>
        <div className="p-6 md:p-8">
          <h3 className="text-lg font-bold text-surface-600 mb-2">{t('ux.ourAdvice')}</h3>
          <h4 className={`text-3xl md:text-4xl font-extrabold mb-3 ${mandi.sell_now_vs_wait === 'sell_now' ? 'text-primary-800' : 'text-surface-800'}`}>
            {t(`tags.${mandi.sell_now_vs_wait}`)}
          </h4>
          <p className="text-lg text-surface-700 leading-relaxed">
            {mandi.sell_now_vs_wait === 'sell_now' ? t('ux.sellNowReason') : t('ux.waitReason')}
          </p>
        </div>
      </div>

      {/* Why This Mandi? */}
      <div className="card p-6 md:p-8">
        <h3 className="text-2xl font-bold text-surface-900 mb-5">{t('ux.whyThisMandi')}</h3>
        <ul className="space-y-4">
          {tags && tags.map((tag, idx) => (
            <li key={idx} className="flex items-start text-lg md:text-xl text-surface-700">
              <CheckCircle2 className="w-6 h-6 text-primary-500 mr-3 mt-1 flex-shrink-0" />
              <span>{t(`tags.${tag}`) || tag}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Weather Risk */}
      {weather && weather.available && (
        <div className="card p-6 md:p-8 flex items-start bg-white">
          {getWeatherIcon(weather.riskLevel)}
          <div>
            <h3 className="text-2xl font-bold text-surface-900 mb-2">{getWeatherTitle(weather.riskLevel)}</h3>
            <p className="text-lg text-surface-700 leading-relaxed mb-2">{getWeatherExplanation(weather.riskLevel)}</p>
            <p className="text-base text-surface-500 font-medium">{t('common.rainProbability')}: {weather.rainProbability}%</p>
          </div>
        </div>
      )}

      {/* Money Breakdown */}
      <div className="card p-6 md:p-8 bg-surface-50">
        <h3 className="text-2xl font-bold text-surface-900 mb-6">{t('ux.moneyBreakdownTitle')}</h3>
        
        <div className="space-y-4 text-lg md:text-xl">
          <div className="flex justify-between items-center text-surface-700">
            <span>{t('ux.cropAmount')}</span>
            <span className="font-medium whitespace-nowrap">{quantityKg.toLocaleString('hi-IN')} {t('common.kg')} ({quantity} क्विंटल)</span>
          </div>
          <div className="flex justify-between items-center text-surface-700">
            <span>{t('common.price')}</span>
            <span className="font-medium whitespace-nowrap">₹{mandi.price.toLocaleString('hi-IN')} {t('common.perKg')}</span>
          </div>
          
          <div className="border-b-2 border-surface-200 my-4"></div>
          
          <div className="flex justify-between items-center font-bold text-surface-900">
            <span>{t('ux.totalSale')}</span>
            <span className="whitespace-nowrap">₹{mandi.expectedRevenue.toLocaleString('hi-IN')}</span>
          </div>
          
          <div className="border-b-2 border-surface-200 my-4"></div>
          
          <div className="flex justify-between items-center text-danger-600">
            <span>{t('common.transportCost')}</span>
            <span className="whitespace-nowrap">− ₹{mandi.transportCost.toLocaleString('hi-IN')}</span>
          </div>
          <div className="flex justify-between items-center text-danger-600">
            <span>{t('common.weatherRisk')}</span>
            <span className="whitespace-nowrap">− ₹{mandi.riskPenalty.toLocaleString('hi-IN')}</span>
          </div>
          
          <div className="border-b-2 border-surface-300 my-4"></div>
          
          <div className="flex justify-between items-center text-2xl font-extrabold text-primary-700">
            <span>{t('common.expectedNetReturn')}</span>
            <span className="whitespace-nowrap">₹{mandi.expectedNetReturn.toLocaleString('hi-IN')}</span>
          </div>
        </div>
      </div>

    </div>
  );
};

export default RecommendationCard;
