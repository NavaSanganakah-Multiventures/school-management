'use client';

import React, { useState, useEffect } from 'react';
import { BookOpen, X, ChevronRight, GraduationCap, FileText, Video } from 'lucide-react';

export function PluginLmsWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState({ totalCourses: 0, totalLessons: 0, totalAssignments: 0 });

  useEffect(() => {
    if (isOpen) {
      fetch('/api/lms/stats')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.stats) setStats(data.stats);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  return (
    <div className="fixed bottom-6 left-6 z-40">
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="h-13 w-13 rounded-full bg-gradient-to-tr from-indigo-700 to-blue-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 flex items-center justify-center cursor-pointer border-2 border-white/30"
          title="डिजिटल LMS त्वरित सूचना"
        >
          <BookOpen className="h-6 w-6" />
        </button>
      )}

      {/* Flyout Modal */}
      {isOpen && (
        <div className="w-80 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-gradient-to-r from-blue-700 to-indigo-700 p-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center text-white">
                <GraduationCap className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-black tracking-tight">डिजिटल LMS केंद्र</h4>
                <p className="text-[10px] text-blue-100">सक्रिय ई-लर्निंग स्टेटस</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100">
                <div className="text-base font-black text-blue-900">{stats.totalCourses}</div>
                <div className="text-[10px] text-blue-600 font-semibold">कोर्सेज</div>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-100">
                <div className="text-base font-black text-indigo-900">{stats.totalAssignments}</div>
                <div className="text-[10px] text-indigo-600 font-semibold">असाइनमेंट्स</div>
              </div>
            </div>

            <div className="text-xs text-slate-600 leading-relaxed font-medium">
              नए वीडियो लेक्चर्स और असाइनमेंट्स देखने व सबमिट करने के लिए मेनू से <strong>LMS पोर्टल</strong> खोलें।
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
