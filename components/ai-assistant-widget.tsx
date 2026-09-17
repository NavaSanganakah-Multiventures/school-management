'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bot, X, Send, Settings, Sparkles, AlertCircle, Loader2 } from 'lucide-react';

export function AIAssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([
    { role: 'ai', content: 'नमस्ते! मैं विद्यासेतु AI असिस्टेंट हूँ। मैं नए छात्रों को जोड़ने में आपकी मदद कर सकता हूँ। छात्र का नाम, कक्षा, पिता का नाम और फोन नंबर बताएं।' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [aiCredits, setAiCredits] = useState(0);
  const [hasCustomKey, setHasCustomKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);
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
    if (isOpen || isSettingsOpen) {
      fetchSettings();
    }
  }, [isOpen, isSettingsOpen]);

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
        await fetchSettings(); // Refresh credits if used
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: `❌ Error: ${data.message}` }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', content: '❌ नेटवर्क त्रुटि। कृपया पुनः प्रयास करें।' }]);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch('/api/ai/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput })
      });
      const data = await res.json();
      if (data.success) {
        setIsSettingsOpen(false);
        fetchSettings();
        setApiKeyInput('');
      } else {
        alert(data.message || 'Settings update failed.');
      }
    } catch (e) {
      alert('Error updating settings.');
    } finally {
      setSettingsLoading(false);
    }
  };

  if (isSettingsOpen) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <h3 className="font-bold flex items-center gap-2 text-slate-800">
              <Settings className="w-5 h-5 text-indigo-600" /> AI Settings
            </h3>
            <button onClick={() => setIsSettingsOpen(false)} className="p-1 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          <div className="p-6 space-y-6">
            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-indigo-900">Credit Based System</p>
                <p className="text-xs text-indigo-700 mt-1">
                  You have <strong className="text-indigo-900">{aiCredits} credits</strong> remaining.
                  Every AI request uses 1 credit.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Custom Gemini API Key (Optional)</label>
              <p className="text-xs text-slate-500 mb-2">Provide your own API key to bypass the credit system completely.</p>
              <input
                type="password"
                placeholder={hasCustomKey ? "•••••••••••••••• (Custom key active)" : "Enter your Google Gemini API Key"}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full border border-slate-200 text-slate-700 rounded-lg text-sm px-3 py-2.5 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
              />
            </div>
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
            <button onClick={() => setIsSettingsOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
            <button 
              onClick={saveSettings}
              disabled={settingsLoading}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors shadow-sm"
            >
              {settingsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end">
      {isOpen && (
        <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl w-[350px] h-[500px] mb-4 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 text-white p-4 flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-white/10 rounded-lg">
                 <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm tracking-wide">VidyaSetu AI</h3>
                <p className="text-[10px] text-indigo-200 font-medium tracking-wider uppercase">
                  {hasCustomKey ? 'Custom Key Active' : `${aiCredits} Credits left`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors" title="Settings">
                <Settings className="w-4 h-4" />
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors" title="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-br-sm' 
                    : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'
                }`}>
                  {msg.role === 'ai' && msg.content.includes('**') ? (
                    <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-slate-500 shadow-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 animate-pulse text-indigo-500" /> <span className="animate-pulse">AI सोच रहा है...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 bg-white border-t border-slate-100 flex items-center gap-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="छात्र को जोड़ने के लिए टाइप करें..."
              className="flex-1 bg-slate-100 text-slate-700 border-transparent rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
            />
            <button 
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors shrink-0 shadow-md shadow-indigo-200/50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="bg-indigo-600 text-white p-4 rounded-full shadow-lg shadow-indigo-300 hover:bg-indigo-700 hover:scale-105 transition-all flex items-center justify-center gap-2 animate-bounce hover:animate-none"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
