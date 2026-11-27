import React from 'react';
import { Bot, Volume2, Square } from 'lucide-react';
import { useTranslation } from '../i18n';

const ChatMessage = ({ message, onSpeak, isSpeaking = false }) => {
  const { t } = useTranslation();
  const isUser = message.sender === 'user';

  // Translate text if it's a translation key like 'chatMsg.msg1'
  let displayText = message.text || '';
  if (typeof displayText === 'string' && displayText.startsWith('chatMsg.')) {
    displayText = t(displayText);
  }

  return (
    <div className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
      {!isUser && (
        <div className="flex-shrink-0 mr-3 mt-1">
          <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 shadow-sm border border-primary-200">
            <Bot className="w-5 h-5" />
          </div>
        </div>
      )}
      
      <div className={`max-w-[85%] md:max-w-[75%] ${isUser ? 'order-1' : 'order-2'}`}>
        <div 
          className={`px-4 py-3 rounded-2xl shadow-sm whitespace-pre-wrap text-base md:text-lg leading-relaxed ${
            isUser 
              ? 'bg-primary-600 text-white rounded-tr-sm shadow-primary-900/10' 
              : 'bg-white border border-surface-200 text-surface-900 rounded-tl-sm'
          }`}
        >
          {displayText}

          {/* Speaker button on assistant messages */}
          {!isUser && onSpeak && (
            <div className="mt-2.5 pt-2 border-t border-surface-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => onSpeak(displayText, message.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs md:text-sm font-bold transition-all cursor-pointer ${
                  isSpeaking
                    ? 'bg-amber-400 text-surface-950 ring-2 ring-amber-300 animate-pulse'
                    : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                }`}
                title={isSpeaking ? 'आवाज़ रोकें' : 'बोलकर सुनें (Listen to Voice)'}
              >
                {isSpeaking ? (
                  <>
                    <Square size={13} className="fill-current" />
                    <span>रोकें (Stop Audio)</span>
                  </>
                ) : (
                  <>
                    <Volume2 size={15} />
                    <span>सुनिए (Listen)</span>
                  </>
                )}
              </button>
              <span className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider">
                फसल सहायक AI
              </span>
            </div>
          )}
        </div>
        <div className={`text-xs text-surface-400 mt-1 px-1 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
          {message.timestamp || ''}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
