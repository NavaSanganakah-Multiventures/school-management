'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, XCircle, Clock, CalendarDays } from 'lucide-react';

interface LeaveManagementPanelProps {
  userRole: 'Director' | 'Principal' | 'Staff';
  currentUserId: string;
}

export function LeaveManagementPanel({ userRole, currentUserId }: LeaveManagementPanelProps) {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaves = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leave-applications');
      const data = await res.json();
      if (data.success) {
        setLeaves(data.leaveApplications || []);
      } else {
        setError(data.message || 'छुट्टियों का डेटा लोड करने में त्रुटि।');
      }
    } catch {
      setError('सर्वर से संपर्क करने में असमर्थ।');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  const updateStatus = async (id: string, status: 'Approved' | 'Rejected') => {
    try {
      const res = await fetch(`/api/leave-applications/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        setLeaves((prev) => prev.map((l) => l.id === id ? { ...l, status } : l));
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('अपडेट करने में त्रुटि।');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>छुट्टियों के आवेदन लोड हो रहे हैं...</span>
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-center text-rose-600">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800">छात्रों की छुट्टी के आवेदन</h3>
      </div>
      
      {leaves.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-xl border border-slate-200">
          <CalendarDays className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">अभी तक कोई छुट्टी का आवेदन नहीं है।</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {leaves.map((leave) => (
            <div key={leave.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-bold text-slate-800">{leave.first_name} {leave.last_name}</h4>
                  <p className="text-xs text-slate-500">Class: {leave.class_name} {leave.section ? `(${leave.section})` : ''} | Roll: {leave.roll_number || 'N/A'}</p>
                </div>
                {leave.status === 'Approved' && <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/> स्वीकृत</span>}
                {leave.status === 'Rejected' && <span className="bg-rose-100 text-rose-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1"><XCircle className="h-3 w-3"/> अस्वीकृत</span>}
                {leave.status === 'Pending' && <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1"><Clock className="h-3 w-3"/> लंबित</span>}
              </div>
              
              <div className="bg-slate-50 p-3 rounded-lg mb-3 flex-grow">
                <p className="text-xs font-medium text-slate-700 mb-1">अवधि (Duration):</p>
                <p className="text-sm font-semibold text-slate-900">{new Date(leave.start_date).toLocaleDateString()} - {new Date(leave.end_date).toLocaleDateString()}</p>
                <p className="text-xs font-medium text-slate-700 mt-2 mb-1">कारण (Reason):</p>
                <p className="text-sm text-slate-800 italic">"{leave.reason}"</p>
              </div>
              
              {leave.status === 'Pending' && (
                <div className="flex gap-2 mt-auto">
                  <button onClick={() => updateStatus(leave.id, 'Approved')} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-sm font-semibold transition">
                    स्वीकृत करें
                  </button>
                  <button onClick={() => updateStatus(leave.id, 'Rejected')} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2 rounded-lg text-sm font-semibold transition">
                    अस्वीकृत करें
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
