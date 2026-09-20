'use client';

import React, { useState, useEffect } from 'react';
import { Blocks, CheckCircle2, ChevronRight, Loader2, Sparkles, Store, Search, AlertCircle } from 'lucide-react';

export function PluginMarketplaceScreen() {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [mySubscriptions, setMySubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchPlugins = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/plugins/marketplace');
      const data = await res.json();
      if (data.success) {
        setPlugins(data.plugins || []);
        setMySubscriptions(data.mySubscriptions || []);
      } else {
        setErrorMsg(data.error || 'Failed to load plugins.');
      }
    } catch (error) {
      console.error('Error fetching plugins:', error);
      setErrorMsg('Network error. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlugins();
  }, []);

  const handleSubscribe = async (pluginId: string) => {
    setActionLoading(pluginId);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/plugins/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        await fetchPlugins();
      } else {
        setErrorMsg(data.error || 'Subscription failed.');
      }
    } catch (error) {
      console.error(error);
      setErrorMsg('Network error. Subscription failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnsubscribe = async (pluginId: string) => {
    setActionLoading(pluginId);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/plugins/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        await fetchPlugins();
      } else {
        setErrorMsg(data.error || 'Failed to remove plugin.');
      }
    } catch (error) {
      console.error(error);
      setErrorMsg('Network error. Failed to remove plugin.');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-slate-500 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-xs font-medium">प्लगइन्स लोड हो रहे हैं...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {errorMsg && (
        <div className="bg-rose-50 text-rose-600 border border-rose-200 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{errorMsg}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-slate-900 to-indigo-950 p-6 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/10 shrink-0">
            <Store className="h-8 w-8 text-indigo-300" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Plugin Marketplace</h1>
            <p className="text-sm text-indigo-200 mt-1 max-w-md">
              अपनी जरूरत के अनुसार स्कूल सिस्टम में नए फीचर्स (Add-ons) जोड़ें।
            </p>
          </div>
        </div>
        <div className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3 flex items-center gap-3 shrink-0">
          <Blocks className="h-5 w-5 text-indigo-300" />
          <div>
            <div className="text-[10px] text-indigo-200 font-bold uppercase tracking-wider">Active Plugins</div>
            <div className="font-black text-xl leading-none mt-0.5">
              {mySubscriptions.filter(s => s.status === 'active').length}
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {plugins.map((plugin) => {
          const subscription = mySubscriptions.find(s => s.plugin_id === plugin.id);
          const isActive = subscription?.status === 'active';
          
          return (
            <div 
              key={plugin.id} 
              className={`flex flex-col rounded-3xl overflow-hidden border transition-all duration-300 ${
                isActive 
                  ? 'bg-white border-indigo-200 shadow-xl shadow-indigo-100/50 ring-1 ring-indigo-50' 
                  : 'bg-white border-slate-200 shadow-sm hover:shadow-md'
              }`}
            >
              {/* Card Header */}
              <div className={`p-5 pb-4 ${isActive ? 'bg-gradient-to-b from-indigo-50/50 to-white' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                    {plugin.id.includes('ai') ? <Sparkles className="h-5 w-5" /> : <Blocks className="h-5 w-5" />}
                  </div>
                  {isActive && (
                    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      subscription?.isEnterpriseIncluded || plugin.isEnterpriseIncluded
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      <CheckCircle2 className="h-3 w-3" />
                      {subscription?.isEnterpriseIncluded || plugin.isEnterpriseIncluded ? '⚡ शामिल (Enterprise)' : 'Installed'}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-lg text-slate-900">{plugin.name}</h3>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed min-h-[40px]">
                  {plugin.description}
                </p>
              </div>

              {/* Price & Actions */}
              <div className="p-5 pt-0 mt-auto border-t border-slate-100 bg-slate-50/50 flex flex-col gap-3">
                <div className="flex items-end justify-between pt-4">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Price / Year</span>
                    {subscription?.isEnterpriseIncluded || plugin.isEnterpriseIncluded ? (
                      <span className="font-black text-indigo-600 text-lg">एंटरप्राइज में मुफ़्त (शामिल)</span>
                    ) : plugin.price > 0 ? (
                      <span className="font-black text-slate-900 text-lg">₹{plugin.price}</span>
                    ) : (
                      <span className="font-black text-emerald-600 text-lg">Free</span>
                    )}
                  </div>
                </div>

                {subscription?.isEnterpriseIncluded || plugin.isEnterpriseIncluded ? (
                  <div className="w-full py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs text-center flex items-center justify-center gap-1.5 shadow-2xs">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>एंटरप्राइज में स्वतः सक्रिय</span>
                  </div>
                ) : isActive ? (
                  <button 
                    onClick={() => handleUnsubscribe(plugin.id)}
                    disabled={actionLoading === plugin.id}
                    className="w-full py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === plugin.id ? 'Removing...' : 'Uninstall Plugin'}
                  </button>
                ) : (
                  <button 
                    onClick={() => handleSubscribe(plugin.id)}
                    disabled={actionLoading === plugin.id}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-200 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {actionLoading === plugin.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Subscribe & Install <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
