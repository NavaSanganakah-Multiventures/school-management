'use client';

import React, { useState, useEffect } from 'react';
import { IndianRupee, Plus, Loader2, Save } from 'lucide-react';

export function FeeManagementPanel() {
  const [activeSubTab, setActiveSubTab] = useState<'heads' | 'structure'>('heads');
  
  const [feeHeads, setFeeHeads] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [newHeadName, setNewHeadName] = useState('');
  
  const [structClass, setStructClass] = useState('1');
  const [structHead, setStructHead] = useState('');
  const [structAmount, setStructAmount] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [hRes, sRes] = await Promise.all([
        fetch('/api/fees/heads'),
        fetch('/api/fees/structure')
      ]);
      const hData = await hRes.json();
      const sData = await sRes.json();
      if (hData.success) setFeeHeads(hData.feeHeads || []);
      if (sData.success) setStructures(sData.feeStructure || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const addFeeHead = async () => {
    if (!newHeadName) return;
    try {
      const res = await fetch('/api/fees/heads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headName: newHeadName })
      });
      const data = await res.json();
      if (data.success) {
        setNewHeadName('');
        loadData();
      } else {
        alert(data.message);
      }
    } catch (e) {
      alert('त्रुटि');
    }
  };

  const addStructure = async () => {
    if (!structClass || !structHead || !structAmount) return;
    try {
      const res = await fetch('/api/fees/structure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className: structClass, feeHeadId: structHead, amount: structAmount })
      });
      const data = await res.json();
      if (data.success) {
        setStructAmount('');
        loadData();
      } else {
        alert(data.message);
      }
    } catch (e) {
      alert('त्रुटि');
    }
  };

  if (loading) {
    return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex bg-slate-100 p-1 rounded-xl w-max">
        <button onClick={() => setActiveSubTab('heads')} className={`px-4 py-2 text-sm font-semibold rounded-lg ${activeSubTab === 'heads' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}>Fee Heads</button>
        <button onClick={() => setActiveSubTab('structure')} className={`px-4 py-2 text-sm font-semibold rounded-lg ${activeSubTab === 'structure' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}>Class Structure</button>
      </div>

      {activeSubTab === 'heads' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-800">Fee Heads (फीस के प्रकार)</h3>
          <div className="flex gap-2">
            <input value={newHeadName} onChange={(e) => setNewHeadName(e.target.value)} placeholder="e.g. Tuition Fee, Bus Fee" className="px-3 py-2 border rounded-lg text-sm flex-1" />
            <button onClick={addFeeHead} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"><Plus className="h-4 w-4"/> जोड़ें</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {feeHeads.map(h => (
              <div key={h.id} className="p-3 bg-slate-50 border rounded-lg font-medium text-sm text-slate-700 flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-slate-400" /> {h.head_name}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'structure' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-800">Class Fee Structure (कक्षा-वार फीस)</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <select value={structClass} onChange={(e) => setStructClass(e.target.value)} className="px-3 py-2 border rounded-lg text-sm flex-1">
              {[...Array(12)].map((_, i) => <option key={i+1} value={String(i+1)}>Class {i+1}</option>)}
            </select>
            <select value={structHead} onChange={(e) => setStructHead(e.target.value)} className="px-3 py-2 border rounded-lg text-sm flex-1">
              <option value="">Select Fee Head</option>
              {feeHeads.map(h => <option key={h.id} value={h.id}>{h.head_name}</option>)}
            </select>
            <input type="number" value={structAmount} onChange={(e) => setStructAmount(e.target.value)} placeholder="Amount (₹)" className="px-3 py-2 border rounded-lg text-sm flex-1" />
            <button onClick={addStructure} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"><Save className="h-4 w-4"/> सेट करें</button>
          </div>
          
          <table className="w-full mt-4 text-sm text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="p-3 font-semibold">Class</th>
                <th className="p-3 font-semibold">Fee Head</th>
                <th className="p-3 font-semibold">Amount</th>
                <th className="p-3 font-semibold">Cycle</th>
              </tr>
            </thead>
            <tbody>
              {structures.map(s => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="p-3 font-medium">Class {s.class_name}</td>
                  <td className="p-3">{s.head_name}</td>
                  <td className="p-3 font-bold text-slate-900">₹{s.amount}</td>
                  <td className="p-3 text-slate-500">{s.billing_cycle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
