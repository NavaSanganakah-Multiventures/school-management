import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, Sparkles, Info } from 'lucide-react';

function renderBoldText(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export function AIAssistantScreen() {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([
    { role: 'ai', content: 'नमस्ते! मैं विद्यासेतु AI असिस्टेंट हूँ। मैं नए छात्रों को जोड़ने में आपकी मदद कर सकता हूँ। छात्र का नाम, कक्षा, पिता का नाम और फोन नंबर बताएं।' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiCredits, setAiCredits] = useState(0);
  const [hasCustomKey, setHasCustomKey] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/ai/settings');
      const data = await res.json();
      if (data.success) {
        setAiCredits(data.aiCredits);
        setHasCustomKey(data.hasCustomApiKey);
      }
    } catch (e) {
      console.error('Failed to fetch AI settings', e);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMsg })
      });
      const data = await res.json();
      
      if (data.success) {
        setMessages(prev => [...prev, { role: 'ai', content: data.message }]);
        await fetchSettings();
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: `❌ Error: ${data.message}` }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', content: '❌ नेटवर्क त्रुटि। कृपया पुनः प्रयास करें।' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 text-white p-6 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-white/10 rounded-xl">
             <Bot className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-bold text-xl tracking-wide">Pragnya Mitra AI</h3>
            <p className="text-sm text-indigo-200 font-medium mt-1">
              {hasCustomKey ? 'Custom API Key Active' : `${aiCredits} Credits left`}
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-indigo-900/40 rounded-xl">
          <Info className="w-4 h-4 text-indigo-200" />
          <span className="text-sm text-indigo-100">आप AI को छात्र जोड़ने के लिए निर्देश दे सकते हैं।</span>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-5 py-3.5 text-base shadow-sm leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-br-sm' 
                : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'
            }`}>
              {msg.role === 'ai' && msg.content.includes('**') ? (
                <div>{renderBoldText(msg.content)}</div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-5 py-3.5 text-base text-slate-500 shadow-sm flex items-center gap-3">
              <Sparkles className="w-5 h-5 animate-pulse text-indigo-500" /> <span className="animate-pulse">AI प्रोसेस कर रहा है...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3 bg-slate-100 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:bg-white transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="यहाँ टाइप करें (उदा: रोहित कुमार कक्षा 5 में पिता राम कुमार फोन 9876543210 को जोड़ें)..."
            className="flex-1 bg-transparent text-slate-700 px-4 py-2 outline-none"
          />
          <button 
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors shrink-0 shadow-md shadow-indigo-200/50"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
