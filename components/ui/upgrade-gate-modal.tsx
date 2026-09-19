'use client';

import React from 'react';
import { Lock, Sparkles, ArrowRight, ShieldCheck, CheckCircle2, MessageSquarePlus } from 'lucide-react';

interface UpgradeGateScreenProps {
  moduleName: string;
  moduleDescription?: string;
  requiredPlanName?: string;
  benefits?: string[];
  onUpgradeClick: () => void;
  onRequestFeatureClick?: () => void;
}

const DEFAULT_MODULE_METADATA: Record<string, { title: string; desc: string; plan: string; benefits: string[] }> = {
  principal: {
    title: 'प्रधानाचार्य प्रबंधन एवं इतिहास',
    desc: 'प्रधानाचार्य नियुक्ति, कार्यकाल इतिहास, विशेषाधिकार व प्रशासनिक नियंत्रण।',
    plan: 'प्रोफेशनल या एंटरप्राइज प्लान',
    benefits: [
      'प्रधानाचार्य का आधिकारिक डिजिटल प्रोफाइल व नियुक्ति रिकॉर्ड',
      'पूर्व एवं वर्तमान प्रधानाचार्यों का कालानुक्रमिक इतिहास',
      'विशेषाधिकार प्राप्त प्रशासनिक अनुमोदन अधिकार',
      'स्वचालित ट्रांसफर व कार्यभार हस्तांतरण लॉग्स'
    ]
  },
  exams: {
    title: 'परीक्षा एवं विस्तृत अंक प्रविष्टि',
    desc: 'सीबीएसई/राज्य बोर्ड अनुरूप विस्तृत अंक तालिका, परीक्षा सारणी व रिपोर्ट कार्ड।',
    plan: 'स्टार्टर, प्रो या एंटरप्राइज प्लान',
    benefits: [
      'टर्म-वाइज और अर्धवार्षिक/वार्षिक परीक्षा प्रबंधन',
      'कक्षा व विषयवार अंक प्रविष्टि व स्वचालित ग्रेडिंग',
      'डिजिटल रिपोर्ट कार्ड निर्माण व प्रिंटिंग',
      'अभिभावकों को एसएमएस/पुश नोटिफिकेशन द्वारा रिजल्ट सूचना'
    ]
  },
  plugins: {
    title: 'प्लगइन मार्केटप्लेस व ऐड-ऑन',
    desc: 'स्कूल की विशिष्ट आवश्यकताओं हेतु एडवांस डिजिटल सेवाएं (LMS, बस ट्रैकिंग, बायोमेट्रिक आदि)।',
    plan: 'प्रोफेशनल या एंटरप्राइज प्लान',
    benefits: [
      'वन-क्लिक प्लगइन एक्टिवेशन व कस्टमाइजेशन',
      'बिना कोर कोड बदले नई क्षमताओं का विस्तार',
      'लर्निंग मैनेजमेंट सिस्टम (LMS) व डिजिटल असाइनमेंट',
      'स्कूल-विशिष्ट प्राइवेट प्लगइन्स का विशेष आवंटन'
    ]
  }
};

export function UpgradeGateScreen({
  moduleName,
  moduleDescription,
  requiredPlanName,
  benefits,
  onUpgradeClick,
  onRequestFeatureClick
}: UpgradeGateScreenProps) {
  const meta = DEFAULT_MODULE_METADATA[moduleName] || {
    title: moduleName,
    desc: moduleDescription || 'यह उन्नत मॉड्यूल आपके वर्तमान सदस्यता प्लान में शामिल नहीं है।',
    plan: requiredPlanName || 'उच्चतर प्लान',
    benefits: benefits || [
      'उन्नत प्रशासनिक सुविधाएं व ऑटोमेशन',
      'उच्चतर डेटा सीमाएं व प्राथमिकता सपोर्ट',
      'सुरक्षित एवं समर्पित स्कूल प्रबंधन'
    ]
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-3xl border-2 border-indigo-100 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 p-8 text-white relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center backdrop-blur-xs">
              <Lock className="w-6 h-6 text-amber-300 animate-pulse" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950 inline-flex items-center gap-1 shadow-xs">
                <Sparkles className="w-3 h-3" /> {meta.plan} आवश्यक
              </span>
              <h2 className="text-xl font-black text-white tracking-tight mt-1">{meta.title}</h2>
            </div>
          </div>
          <p className="text-xs text-blue-100 max-w-lg leading-relaxed">{meta.desc}</p>
        </div>

        <div className="p-8 space-y-6">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              इस मॉड्यूल के मुख्य लाभ एवं विशेषताएं:
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {meta.benefits.map((b, idx) => (
                <div key={idx} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{b}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-3 justify-between">
            <div className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">तत्काल सक्रियण:</span> अपग्रेड करते ही यह मॉड्यूल बिना किसी डाउनटाइम के तुरंत उपलब्ध हो जाएगा।
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              {onRequestFeatureClick && (
                <button
                  type="button"
                  onClick={onRequestFeatureClick}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                >
                  <MessageSquarePlus className="w-4 h-4 text-indigo-600" />
                  <span>कस्टम आवश्यकता बताएं</span>
                </button>
              )}

              <button
                type="button"
                onClick={onUpgradeClick}
                className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white text-xs font-bold shadow-md hover:shadow-lg transition cursor-pointer flex items-center justify-center gap-2"
              >
                <span>प्लान में अपग्रेड करें</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
