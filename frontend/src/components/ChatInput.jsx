import React, { useState, useRef, useEffect } from 'react';
import { Mic, SendHorizontal } from 'lucide-react';
import { useTranslation } from '../i18n';

const ChatInput = ({ onSend, disabled }) => {
  const { t, lang } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = lang === 'en' ? 'en-IN' : 'hi-IN';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInputValue(transcript);
      };

      recognition.onerror = (event) => {
        console.warn('[Chat Speech error]:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
    };
  }, [lang]);

  const toggleVoice = () => {
    if (!recognitionRef.current) {
      alert(lang === 'hi' ? 'इस ब्राउज़र में आवाज़ इनपुट समर्थित नहीं है। कृपया Chrome इस्तेमाल करें।' : 'Voice input not supported in this browser. Please use Chrome.');
      return;
    }

    if (isListening) {
      try { recognitionRef.current.stop(); } catch (e) {}
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        try {
          recognitionRef.current.abort();
          setTimeout(() => recognitionRef.current.start(), 150);
        } catch (e) {}
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim() && !disabled) {
      onSend(inputValue.trim());
      setInputValue('');
      if (isListening && recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form 
      onSubmit={handleSubmit}
      className="bg-white border-t border-surface-200 p-3 md:p-4 flex items-center gap-2 shadow-sm"
    >
      <button
        type="button"
        onClick={toggleVoice}
        disabled={disabled}
        className={`flex-shrink-0 p-2.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer ${
          isListening 
            ? 'bg-red-600 text-white animate-pulse ring-4 ring-red-200' 
            : 'text-surface-500 hover:text-primary-600 hover:bg-primary-50'
        }`}
        title={isListening ? 'बोलना बंद करें' : 'बोलकर पूछें (Tap to Speak)'}
      >
        {isListening ? (
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
            <Mic className="w-5 h-5" />
          </div>
        ) : (
          <Mic className="w-5 h-5" />
        )}
      </button>
      
      <div className="flex-1 relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={isListening ? 'सुन रहे हैं... बोलिए (Listening...)' : t('chat.inputPlaceholder', 'अपना सवाल लिखें या बोलें...')}
          className={`form-input w-full py-2.5 pl-4 pr-4 rounded-full border-surface-300 focus:border-primary-500 focus:ring-primary-500 transition-colors text-base ${
            isListening ? 'bg-amber-50 text-surface-900 border-amber-300' : 'bg-surface-50 focus:bg-white'
          }`}
        />
      </div>
      
      <button
        type="submit"
        disabled={disabled || !inputValue.trim()}
        className="flex-shrink-0 p-2.5 bg-primary-600 text-white rounded-full hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 shadow-sm cursor-pointer"
        title="भेजें (Send)"
      >
        <SendHorizontal className="w-5 h-5 ml-0.5" />
      </button>
    </form>
  );
};

export default ChatInput;
