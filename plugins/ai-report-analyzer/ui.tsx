import React, { useState } from 'react';
import { Bot, Sparkles, AlertCircle } from 'lucide-react';

export default function AIReportAnalyzerUI({ schoolId }: { schoolId: string }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleAnalyze = () => {
    setAnalyzing(true);
    // Mock API call to the plugin's backend
    setTimeout(() => {
      setResult("AI Analysis complete: Students in Section B are showing a 15% drop in Mathematics scores compared to last term. Recommendation: Schedule remedial classes for Algebra.");
      setAnalyzing(false);
    }, 2000);
  };

  return (
    <div className="bg-gradient-to-br from-indigo-900 to-purple-900 p-6 rounded-2xl text-white shadow-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 bg-white/20 rounded-xl">
          <Bot className="h-8 w-8 text-indigo-300" />
        </div>
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            AI Report Analyzer <Sparkles className="h-5 w-5 text-amber-300" />
          </h3>
          <p className="text-sm text-indigo-200">Powered by VidyaSetu AI (Plugin)</p>
        </div>
      </div>

      {!result ? (
        <div className="space-y-4">
          <p className="text-sm text-indigo-100">
            Select a class or term to let the AI analyze performance trends and generate actionable insights.
          </p>
          <button 
            onClick={handleAnalyze}
            disabled={analyzing}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg font-bold text-sm shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {analyzing ? (
              <span className="animate-pulse">Analyzing Data...</span>
            ) : (
              <>Run AI Analysis</>
            )}
          </button>
        </div>
      ) : (
        <div className="bg-white/10 border border-white/20 p-4 rounded-xl space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-300 shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">{result}</p>
          </div>
          <button 
            onClick={() => setResult(null)}
            className="text-xs font-bold text-indigo-300 hover:text-white"
          >
            Reset Analysis
          </button>
        </div>
      )}
    </div>
  );
}
