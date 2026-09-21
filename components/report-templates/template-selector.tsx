'use client';

import React, { useState, useEffect } from 'react';
import { CBSETemplate, StateBoardTemplate, ModernTemplate } from './index';
import { Settings, Eye, Check, Download, Printer, School, Palette, FileText } from 'lucide-react';

interface ReportData {
  student: {
    name: string;
    rollNumber: string;
    class: string;
    section: string;
    fatherName?: string;
    motherName?: string;
    dob?: string;
    admissionNo?: string;
  };
  exam: {
    name: string;
    academicYear: string;
    term?: string;
  };
  marks: {
    subject: string;
    maxMarks: number;
    marksObtained: number;
    grade?: string;
    remarks?: string;
  }[];
  totals: {
    totalMaxMarks: number;
    totalMarksObtained: number;
    percentage: number;
    overallGrade?: string;
    overallRemarks?: string;
    rank?: string;
  };
  school?: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
  };
  date?: string;
}

interface TemplateSelectorProps {
  reportData: ReportData;
  schoolName?: string;
  schoolCode?: string;
  affiliationNo?: string;
}

export function TemplateSelector({ reportData, schoolName, schoolCode, affiliationNo }: TemplateSelectorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('cbse');
  const [previewMode, setPreviewMode] = useState<boolean>(true);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [schoolPrefs, setSchoolPrefs] = useState<any>(null);
  const [customizing, setCustomizing] = useState<boolean>(false);
  const [customSettings, setCustomSettings] = useState({
    schoolLogo: '',
    showSeal: true,
    showQR: false,
    showGraph: true,
    showRemarks: true,
  });

  const loadTemplatesAndPrefs = async () => {
    setLoading(true);
    try {
      const [templatesRes, prefsRes] = await Promise.all([
        fetch('/api/exams/templates'),
        fetch('/api/exams/school-preferences')
      ]);
      
      const templatesData = await templatesRes.json();
      const prefsData = await prefsRes.json();
      
      if (templatesData.success) {
        setTemplates(templatesData.templates || []);
      }
      if (prefsData.success && prefsData.preferences) {
        setSchoolPrefs(prefsData.preferences);
        if (prefsData.preferences.default_report_template_id) {
          setSelectedTemplate(prefsData.preferences.default_report_template_id.replace('template_', ''));
        }
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSchoolPreferences = async () => {
    try {
      const res = await fetch('/api/exams/school-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultReportTemplateId: `template_${selectedTemplate}`,
          ...customSettings,
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('टेम्पलेट प्राथमिकता सफलतापूर्वक सहेजी गई!');
        await loadTemplatesAndPrefs();
      }
    } catch (error) {
      alert('प्राथमिकता सहेजने में त्रुटि।');
    }
  };

  useEffect(() => {
    loadTemplatesAndPrefs();
  }, []);

  const templateComponents: Record<string, React.ComponentType<any>> = {
    cbse: CBSETemplate,
    state: StateBoardTemplate,
    modern: ModernTemplate,
    minimal: ({ data }: any) => (
      <div className="bg-white p-8 border-2 border-slate-200 rounded-xl">
        <h2 className="text-xl font-black text-slate-900 mb-4">Simple Report</h2>
        {/* Simple template implementation */}
      </div>
    ),
  };

  const SelectedTemplate = templateComponents[selectedTemplate] || CBSETemplate;

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <Settings className="h-8 w-8 animate-spin mx-auto mb-3" />
        <p>Loading template settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900 to-blue-900 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <Palette className="h-6 w-6 text-amber-300" />
              मार्कशीट टेम्पलेट कॉन्फ़िगरेशन
            </h1>
            <p className="text-sm text-blue-200 mt-1">
              डायरेक्टर/प्रधानाचार्य: आप स्कूल के लिए मार्कशीट टेम्पलेट चुन और कस्टमाइज़ कर सकते हैं।
            </p>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-xl">
            <div className="text-xs text-blue-100">Current School</div>
            <div className="font-bold text-sm">{schoolName || 'Pragnya Mitra Higher Secondary School'}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sidebar: Template Selection */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600" />
              Available Templates
            </h3>
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template.id.replace('template_', ''))}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                    selectedTemplate === template.id.replace('template_', '')
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      selectedTemplate === template.id.replace('template_', '')
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      <School className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-sm">{template.template_name}</div>
                      <div className="text-xs text-slate-500">{template.description}</div>
                    </div>
                  </div>
                  {selectedTemplate === template.id.replace('template_', '') && (
                    <Check className="h-5 w-5 text-indigo-600" />
                  )}
                </button>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <h4 className="font-bold text-slate-800 mb-3">Customization</h4>
              <button
                onClick={() => setCustomizing(!customizing)}
                className="w-full flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Settings className="h-4 w-4" />
                  Customize Settings
                </div>
                <span className="text-xs text-slate-500">{(customizing ? 'Hide' : 'Show')}</span>
              </button>

              {customizing && (
                <div className="mt-3 space-y-3 bg-slate-50 p-3 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">Show School Logo</span>
                    <input
                      type="checkbox"
                      checked={customSettings.schoolLogo !== ''}
                      onChange={(e) => setCustomSettings({...customSettings, schoolLogo: e.target.checked ? '/logo.png' : ''})}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">Show School Seal</span>
                    <input
                      type="checkbox"
                      checked={customSettings.showSeal}
                      onChange={(e) => setCustomSettings({...customSettings, showSeal: e.target.checked})}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">Show QR Code</span>
                    <input
                      type="checkbox"
                      checked={customSettings.showQR}
                      onChange={(e) => setCustomSettings({...customSettings, showQR: e.target.checked})}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">Show Performance Graph</span>
                    <input
                      type="checkbox"
                      checked={customSettings.showGraph}
                      onChange={(e) => setCustomSettings({...customSettings, showGraph: e.target.checked})}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h4 className="font-bold text-slate-800 mb-3">Actions</h4>
            <div className="space-y-2">
              <button
                onClick={() => setPreviewMode(!previewMode)}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition-colors"
              >
                <Eye className="h-4 w-4" />
                {previewMode ? 'Hide Preview' : 'Show Preview'}
              </button>
              <button
                onClick={saveSchoolPreferences}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition-colors"
              >
                <Check className="h-4 w-4" />
                Save as School Default
              </button>
              <button
                onClick={() => window.print()}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition-colors"
              >
                <Printer className="h-4 w-4" />
                Print Preview
              </button>
            </div>
          </div>

          {/* Current Preference */}
          {schoolPrefs && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <h4 className="font-bold text-emerald-800 text-sm mb-2">Current School Preference</h4>
              <div className="text-xs text-emerald-700">
                <div>Default Template: <span className="font-bold">{schoolPrefs.default_report_template_id?.replace('template_', '').toUpperCase() || 'CBSE'}</span></div>
                <div>Last Updated: {schoolPrefs.updated_at ? new Date(schoolPrefs.updated_at).toLocaleDateString('hi-IN') : 'Not Set'}</div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Template Preview */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="border-b border-slate-200 p-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-600" />
                Template Preview: {templates.find(t => t.id === `template_${selectedTemplate}`)?.template_name || selectedTemplate.toUpperCase()}
              </h3>
              <div className="text-xs text-slate-500">
                Size: A4 (210mm × 297mm)
              </div>
            </div>

            <div className={`p-6 ${previewMode ? '' : 'hidden'}`}>
              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <p className="text-sm text-slate-700">
                  This preview shows how the marksheet will look when printed. The actual data shown is sample data.
                  {(!reportData?.marks || reportData.marks.length === 0) && (
                    <span className="text-amber-700 font-bold ml-2">⚠️ Note: No real student marks data available for preview.</span>
                  )}
                </p>
              </div>

              <div className="border border-slate-300 rounded-lg overflow-hidden shadow-lg">
                <div className="bg-white scale-90 origin-top print:scale-100">
                  <SelectedTemplate
                    data={reportData || {
                      studentName: "राहुल शर्मा",
                      scholarNumber: "SR-2026/045",
                      rollNumber: "23",
                      className: "10वीं",
                      section: "B",
                      fatherName: "रमेश शर्मा",
                      motherName: "सीमा शर्मा",
                      dob: "15-06-2011",
                      term: "अर्धवार्षिक परीक्षा 2026-27",
                      academicYear: "2026-27",
                      subjects: [
                        { subject: "हिंदी", marks: 82, maxMarks: 100, grade: "A", percentage: 82, remarks: "उत्तम" },
                        { subject: "अंग्रेजी", marks: 78, maxMarks: 100, grade: "A", percentage: 78, remarks: "अच्छा" },
                        { subject: "गणित", marks: 88, maxMarks: 100, grade: "A+", percentage: 88, remarks: "उत्कृष्ट" },
                        { subject: "विज्ञान", marks: 84, maxMarks: 100, grade: "A", percentage: 84, remarks: "अति उत्तम" },
                        { subject: "सामाजिक विज्ञान", marks: 75, maxMarks: 100, grade: "A", percentage: 75, remarks: "संतोषजनक" },
                      ],
                      totalMarks: 407,
                      maxTotal: 500,
                      percentage: 81.4,
                      finalGrade: "A",
                      result: "उत्तीर्ण (PASS)",
                      division: "प्रथम श्रेणी",
                    }}
                    schoolName={schoolName}
                    schoolCode={schoolCode}
                    affiliationNo={affiliationNo}
                    showSeal={customSettings.showSeal}
                    showAnalytics={customSettings.showGraph}
                    qrCodeUrl={customSettings.showQR ? '/api/qr/student-123' : undefined}
                  />
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-500">
                  This is a preview. Actual marksheets will be generated with real student data.
                </p>
              </div>
            </div>

            {!previewMode && (
              <div className="p-12 text-center text-slate-500">
                <Eye className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p>Preview is currently hidden</p>
                <button
                  onClick={() => setPreviewMode(true)}
                  className="mt-3 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700"
                >
                  Show Preview
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
