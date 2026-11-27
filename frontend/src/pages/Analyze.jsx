import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Keyboard, Mic, Camera, MapPin, Navigation, Loader2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import VoiceHeroCard from '../components/VoiceHeroCard';
import VoiceInput from '../components/VoiceInput';
import ImageInput from '../components/ImageInput';
import { cropOptions, unitOptions } from '../data/mockData';
import { useTranslation } from '../i18n';
import { analyzeDecision } from '../services/decisionService';

export default function Analyze() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [inputMode, setInputMode] = useState('type'); // 'type', 'voice', 'image'
  const [formData, setFormData] = useState({
    crop: '',
    variety: '',
    quantity: '',
    unit: 'kg',
    location: '',
    latitude: null,
    longitude: null
  });
  const [isImageSelected, setIsImageSelected] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isImageConfirmed, setIsImageConfirmed] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');

  const detectLiveLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported');
      return;
    }

    setIsLocating(true);
    setLocationStatus('locating');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`, {
            headers: {
              'User-Agent': 'FasalNirnay-LiveApp/2.0'
            }
          });
          if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            const city = addr.city || addr.town || addr.village || addr.suburb || addr.state_district || addr.county || '';
            const state = addr.state || '';
            const detectedName = [city, state].filter(Boolean).join(', ') || data.display_name || `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
            setFormData(prev => ({
              ...prev,
              location: detectedName,
              latitude,
              longitude
            }));
            setLocationStatus('detected');
          } else {
            setFormData(prev => ({
              ...prev,
              location: prev.location || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
              latitude,
              longitude
            }));
            setLocationStatus('detected');
          }
        } catch (e) {
          setFormData(prev => ({
            ...prev,
            location: prev.location || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
            latitude,
            longitude
          }));
          setLocationStatus('detected');
        } finally {
          setIsLocating(false);
        }
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        setIsLocating(false);
        setLocationStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    // Clear stale image analysis data when starting a new analysis flow
    sessionStorage.removeItem('fasalnirnay_image_analysis');
    // Automatically detect live location on mount
    detectLiveLocation();
  }, []);

  const handleModeChange = (mode) => {
    setInputMode(mode);
    if (mode !== 'image') {
      sessionStorage.removeItem('fasalnirnay_image_analysis');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      // If user types location manually, reset coordinates to let backend geocode text
      if (name === 'location') {
        next.latitude = null;
        next.longitude = null;
      }
      return next;
    });
    setErrorMsg('');
  };

  const handleAnalyze = async () => {
    // 1. Validate
    if (!formData.crop || !formData.variety || !formData.quantity || !formData.location) {
      setErrorMsg('कृपया सभी आवश्यक जानकारी (फसल, किस्म, मात्रा, स्थान) भरें।');
      return;
    }

    // 2. Set loading
    setIsAnalyzing(true);
    setErrorMsg('');

    try {
      // 3. Call backend with coordinates and location
      const result = await analyzeDecision(formData);
      
      // 4. Navigate on success
      navigate('/results', { 
        state: { 
          decision: result,
          searchParams: {
            crop: formData.crop,
            variety: formData.variety || 'hybrid',
            quantityKg: (formData.unit === 'quintal' || formData.unit === 'क्विंटल') ? Number(formData.quantity) * 100 : Number(formData.quantity),
            quantityQuintals: (formData.unit === 'quintal' || formData.unit === 'क्विंटल') ? Number(formData.quantity) : Number(formData.quantity) / 100,
            location: formData.location,
            latitude: formData.latitude,
            longitude: formData.longitude
          }
        } 
      });
    } catch (err) {
      console.error("Analysis Failed:", err);
      // 5. Handle error gracefully
      const message = err.message || 'सर्वर से जानकारी नहीं मिल पा रही है। कृपया कुछ देर बाद फिर कोशिश करें।';
      setErrorMsg(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVoiceAnalyze = async (voicePayload) => {
    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const result = await analyzeDecision({
        crop: voicePayload.crop,
        variety: voicePayload.variety || 'hybrid',
        quantity: voicePayload.quantityKg,
        unit: 'kg',
        location: voicePayload.location || formData.location,
        latitude: voicePayload.latitude ?? formData.latitude,
        longitude: voicePayload.longitude ?? formData.longitude
      });

      navigate('/results', {
        state: {
          decision: result,
          fromVoice: true,
          searchParams: {
            crop: voicePayload.crop,
            variety: voicePayload.variety || 'hybrid',
            quantityKg: voicePayload.quantityKg,
            quantityQuintals: voicePayload.quantityQuintals || (voicePayload.quantityKg / 100),
            location: voicePayload.location || formData.location,
            latitude: voicePayload.latitude ?? formData.latitude,
            longitude: voicePayload.longitude ?? formData.longitude
          }
        }
      });
    } catch (err) {
      console.error("Voice Analysis Failed:", err);
      setErrorMsg(err.message || 'सर्वर से जानकारी नहीं मिल पा रही है। कृपया कुछ देर बाद फिर कोशिश करें।');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const renderManualForm = () => (
    <div className="space-y-6">
      <div>
        <label className="form-label">{t('analyze.crop')}</label>
        <select 
          name="crop" 
          value={formData.crop} 
          onChange={handleInputChange} 
          className="form-select"
        >
          <option value="">{t('analyze.selectCropPlaceholder', 'फसल चुनें (Select)')}</option>
          {cropOptions && cropOptions.map(option => (
            <option key={option} value={option}>{t('crops.' + option) || option}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="form-label">{t('analyze.variety')}</label>
        <input 
          type="text" 
          name="variety" 
          value={formData.variety} 
          onChange={handleInputChange} 
          className="form-input" 
          placeholder={t('analyze.varietyPlaceholder') || 'किस्म दर्ज करें (उदा. Hybrid, Desi)'}
        />
      </div>

      <div>
        <label className="form-label">{t('analyze.quantity')}</label>
        <div className="flex gap-4">
          <input 
            type="number" 
            name="quantity" 
            value={formData.quantity} 
            onChange={handleInputChange} 
            className="form-input flex-2" 
            placeholder={t('analyze.quantityPlaceholder') || 'मात्रा दर्ज करें (उदा. 500)'}
          />
          <select 
            name="unit" 
            value={formData.unit} 
            onChange={handleInputChange} 
            className="form-select flex-1"
          >
            {unitOptions && unitOptions.map(unit => (
              <option key={unit} value={unit}>{t('common.' + unit)}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="form-label mb-0">{t('analyze.location')}</label>
          <button 
            type="button" 
            onClick={detectLiveLocation} 
            disabled={isLocating}
            className="text-xs md:text-sm font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary-50 border border-primary-200 hover:bg-primary-100 transition-colors cursor-pointer"
          >
            {isLocating ? (
              <>
                <Loader2 size={14} className="animate-spin text-primary-600" />
                <span>लोकेशन खोजी जा रही है...</span>
              </>
            ) : (
              <>
                <Navigation size={14} className="text-primary-600" />
                <span>मेरी लोकेशन लें / Use My Live Location</span>
              </>
            )}
          </button>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MapPin size={20} className="text-surface-400" />
          </div>
          <input 
            type="text" 
            name="location" 
            value={formData.location} 
            onChange={handleInputChange} 
            className="form-input pl-10" 
            placeholder={t('analyze.locationPlaceholder') || 'गाँव, शहर या ज़िला दर्ज करें / Enter city, village'}
          />
        </div>
        {locationStatus === 'detected' && (
          <p className="text-xs text-green-700 mt-1.5 flex items-center gap-1 font-medium">
            ✓ लाइव लोकेशन पहचानी गई (Live GPS Detected)
          </p>
        )}
        {locationStatus === 'denied' && (
          <p className="text-xs text-surface-500 mt-1.5">
            GPS अनुमति नहीं मिली — कृपया अपना शहर या ज़िला टाइप करें (Manual entry enabled)
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="page-container animate-fade-in">
      <PageHeader 
        title={t('analyze.title')} 
        subtitle={t('analyze.subtitle')}
      />

      <div className="max-w-3xl mx-auto">
        {/* Prominent Push-to-Talk Voice Hero Card */}
        <VoiceHeroCard 
          detectedLocation={formData.location}
          latitude={formData.latitude}
          longitude={formData.longitude}
          onAnalyze={handleVoiceAnalyze}
          onUpdateFormData={(updates) => {
            setFormData(prev => ({
              ...prev,
              ...updates
            }));
          }}
          isAnalyzing={isAnalyzing}
        />

        {/* Manual Form Separator / Header */}
        <div className="flex items-center my-8">
          <div className="flex-1 border-t border-surface-200"></div>
          <span className="px-4 text-xs md:text-sm font-semibold uppercase tracking-wider text-surface-400 bg-surface-50 rounded-full">
            या नीचे फॉर्म में खुद दर्ज करें (Or Use Manual Form)
          </span>
          <div className="flex-1 border-t border-surface-200"></div>
        </div>

        {/* Input Mode Tabs */}
        <div className="flex flex-col sm:flex-row bg-surface-100 p-1.5 rounded-xl mb-8 gap-1.5">
          <button 
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium text-lg transition-all ${inputMode === 'type' ? 'bg-white shadow-md text-primary-700' : 'text-surface-600 hover:bg-surface-200'}`}
            onClick={() => handleModeChange('type')}
          >
            <Keyboard size={20} />
            {t('analyze.typeDetails')}
          </button>
          <button 
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium text-lg transition-all ${inputMode === 'voice' ? 'bg-white shadow-md text-primary-700' : 'text-surface-600 hover:bg-surface-200'}`}
            onClick={() => handleModeChange('voice')}
          >
            <Mic size={20} />
            {t('analyze.voiceInput')}
          </button>
          <button 
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium text-lg transition-all ${inputMode === 'image' ? 'bg-white shadow-md text-primary-700' : 'text-surface-600 hover:bg-surface-200'}`}
            onClick={() => { handleModeChange('image'); setIsImageConfirmed(false); setIsImageSelected(false); }}
          >
            <Camera size={20} />
            {t('analyze.imageInput') || 'फोटो लें'}
          </button>
        </div>

        <div className="card p-6 md:p-8">
          
          {inputMode === 'type' && (
            <div className="py-2">
              {renderManualForm()}
            </div>
          )}

          {inputMode === 'voice' && (
            <div className="py-8">
              <VoiceInput onVoiceSuccess={(data) => {
                setFormData(prev => ({
                  ...prev,
                  crop: data.crop || prev.crop,
                  variety: data.variety || prev.variety,
                  quantity: data.quantity || prev.quantity,
                  location: data.location || prev.location
                }));
                setInputMode('type');
              }} />
            </div>
          )}

          {inputMode === 'image' && (
            <div className="py-2 space-y-8">
              <ImageInput 
                onImageSelect={(file) => {
                  setIsImageSelected(!!file);
                  setIsImageConfirmed(false);
                }} 
                onCropDetected={(data) => {
                  setIsImageConfirmed(true);
                  if (data) {
                    setFormData(prev => ({
                      ...prev,
                      crop: data.cropId || prev.crop,
                      variety: data.varietyId || prev.variety
                    }));
                  }
                }}
              />
              
              {isImageSelected && isImageConfirmed && (
                <div className="pt-8 border-t-2 border-surface-200 mt-8 animate-fade-in">
                  {renderManualForm()}
                </div>
              )}
            </div>
          )}

          {/* Action Area */}
          {(inputMode === 'type' || (inputMode === 'image' && isImageSelected && isImageConfirmed)) && (
            <div className="mt-8 pt-8 border-t-2 border-surface-200">
              {errorMsg && (
                <div className="mb-6 p-4 bg-danger-50 text-danger-700 rounded-lg text-center font-semibold text-lg border border-danger-100">
                  {errorMsg}
                </div>
              )}
              <button 
                onClick={handleAnalyze} 
                disabled={isAnalyzing}
                className={`btn btn-primary w-full py-4 text-xl font-bold rounded-xl shadow-md hover:shadow-lg transition-all ${isAnalyzing ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isAnalyzing ? "आपकी फसल का विश्लेषण हो रहा है..." : t('analyze.analyzeCrop')}
              </button>
              <p className="text-base text-center text-surface-500 mt-4 font-medium">
                {t('analyze.analyzeNote')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
