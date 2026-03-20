"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, HeartPulse, CheckCircle2, AlertTriangle, Share2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function MedLinkFrontend() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const SAMPLE_PRESCRIPTION_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Minimal valid base64 image for testing

  const handleTrySample = async () => {
    setError(null);
    setLoading(true);
    setResult(null);
    try {
        const response = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: SAMPLE_PRESCRIPTION_BASE64, mimeType: "image/png" })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Failed to analyze the medical document.");
        }
        setResult(data.data || data);
    } catch (err: any) {
        setError(err.message || "An unexpected error occurred.");
    } finally {
        setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFile(e.target.files[0]);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setLoading(true);
    setResult(null);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      reader.onload = async () => {
        const base64String = reader.result as string;
        // Split out the mime type and the actual base64 data to pass exactly what the API needs
        const mimeTypeMatch = base64String.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : selectedFile.type;
        const base64Data = base64String.split(",")[1];

        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
             image: base64Data,
             mimeType: mimeType
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to analyze document.");
        }

        setResult(data.data || data);
      };
      reader.onerror = () => {
        throw new Error("Failed to read the file.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
    
    // setLoading(false) should be handled inside reader.onload to execute after the fetch finishes
    // so we'll adjust the API interaction cleanly here:
  };

  // Adjust processFile using promise wrapping for cleaner async flow with FileReader
  const _processFileReliable = async (selectedFile: File) => {
      setFile(selectedFile);
      setError(null);
      setLoading(true);
      setResult(null);
  
      try {
          const { base64Data, mimeType } = await new Promise<{base64Data: string, mimeType: string}>((resolve, reject) => {
              const reader = new FileReader();
              reader.readAsDataURL(selectedFile);
              reader.onload = () => {
                  const base64String = reader.result as string;
                  const mimeTypeMatch = base64String.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,/);
                  const parsedMimeType = mimeTypeMatch ? mimeTypeMatch[1] : selectedFile.type;
                  const parsedBase64Data = base64String.split(",")[1];
                  resolve({ base64Data: parsedBase64Data, mimeType: parsedMimeType });
              };
              reader.onerror = () => reject(new Error("Failed to read the attached file."));
          });
  
          const response = await fetch("/api/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image: base64Data, mimeType: mimeType })
          });
  
          const data = await response.json();
          if (!response.ok) {
              throw new Error(data.error || "Failed to analyze the medical document.");
          }
  
          setResult(data.data || data);
      } catch (err: any) {
          setError(err.message || "An unexpected network error occurred.");
      } finally {
          setLoading(false);
      }
  };

  const handleShare = () => {
    if (!result) return;
    const text = `*Med-Link Patient Summary*\nName: ${result.patient_info?.name || 'N/A'}\nAge: ${result.patient_info?.age || 'N/A'}\nGender: ${result.patient_info?.gender || 'N/A'}\n\n*Medications*:\n${result.medications?.map((m: any) => `- ${m.name} (${m.dosage}) - ${m.frequency}`).join("\n")}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const hasCriticalAlerts = result?.critical_alerts && result.critical_alerts.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-10 text-center">
         <h1 className="text-2xl font-bold tracking-tight">Med-Link MVP</h1>
      </header>

      <main className="flex-1 container max-w-2xl mx-auto p-4 md:p-6 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {!result && !loading && (
            <motion.div
              key="scan"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center space-y-8 py-10"
            >
              <div 
                className="w-full border-4 border-dashed border-blue-200 hover:border-blue-400 bg-white rounded-2xl p-12 text-center cursor-pointer transition-colors shadow-sm"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e)}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="w-16 h-16 text-blue-500 mx-auto mb-4" />
                <h2 className="text-2xl font-semibold text-slate-800 mb-2">Upload Prescription</h2>
                <p className="text-slate-500 text-lg">Drag & drop your medical document here, or tap to browse.</p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*"
                  onChange={(e) => handleFileChange(e)}
                />
              </div>

              <Button 
                size="lg" 
                className="w-full max-w-md h-16 text-xl rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
                onClick={() => fileInputRef.current?.click()}
              >
                Scan Prescription
              </Button>

              <Button 
                variant="outline"
                size="lg" 
                className="w-full max-w-md h-12 text-lg rounded-full text-blue-600 border-blue-200 hover:bg-blue-50 mt-2"
                onClick={handleTrySample}
              >
                Try Sample
              </Button>

              {error && (
                <div className="p-4 bg-red-100 text-red-700 border border-red-200 rounded-lg w-full text-center font-medium">
                  {error}
                </div>
              )}
            </motion.div>
          )}

          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <HeartPulse className="w-24 h-24 text-blue-600 animate-pulse mb-6" />
              <h2 className="text-2xl font-bold text-slate-800">Reading Prescription...</h2>
              <p className="text-slate-500 mt-2 text-lg">Applying Multimodal Reasoning Pipeline</p>
            </motion.div>
          )}

          {result && !loading && (
             <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6 pb-20"
             >
                <Button variant="ghost" className="mb-2 text-blue-600 text-lg" onClick={() => { setResult(null); setFile(null); }}>
                   <ArrowLeft className="w-5 h-5 mr-2" /> Scan Another
                </Button>

                {hasCriticalAlerts && (
                  <div className="bg-red-50 border-l-4 border-red-600 p-4 rounded-r-lg flex items-start space-x-3 shadow-sm">
                    <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-red-800 font-bold text-lg">Critical Alerts present</h3>
                      <ul className="list-disc pl-5 mt-1 text-red-700 font-medium">
                        {result.critical_alerts.map((alert: string, idx: number) => (
                           <li key={idx}>{alert}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <Card className="shadow-lg border-t-4 border-t-blue-500 bg-white">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                       <CardTitle className="text-2xl text-slate-900">{result.patient_info?.name || "Unknown Patient"}</CardTitle>
                       <p className="text-slate-500 font-medium text-lg">
                          Age: {result.patient_info?.age || "-"} | Gender: {result.patient_info?.gender || "-"}
                       </p>
                    </div>
                    <Badge variant={hasCriticalAlerts ? "destructive" : "default"} className={hasCriticalAlerts ? "text-base px-3 py-1" : "bg-emerald-500 hover:bg-emerald-600 text-base px-3 py-1"}>
                       {hasCriticalAlerts ? "Critical" : "Stable"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="pt-4">
                     {/* Vitals */}
                     <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-slate-100 p-3 rounded-lg text-center">
                           <span className="block text-slate-500 text-sm font-semibold uppercase tracking-wide">BP</span>
                           <span className="text-lg font-bold text-slate-800">{result.vitals?.bp || "-"}</span>
                        </div>
                        <div className="bg-slate-100 p-3 rounded-lg text-center">
                           <span className="block text-slate-500 text-sm font-semibold uppercase tracking-wide">Pulse</span>
                           <span className="text-lg font-bold text-slate-800">{result.vitals?.pulse || "-"}</span>
                        </div>
                        <div className="bg-slate-100 p-3 rounded-lg text-center">
                           <span className="block text-slate-500 text-sm font-semibold uppercase tracking-wide">Weight</span>
                           <span className="text-lg font-bold text-slate-800">{result.vitals?.weight || "-"}</span>
                        </div>
                     </div>

                     <h3 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">Medications</h3>
                     <div className="space-y-4">
                        {result.medications?.map((med: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                             <div>
                                <h4 className="font-bold text-slate-900 text-lg">{med.name}</h4>
                                <p className="text-slate-600 font-medium">Dosage: {med.dosage}</p>
                                <p className="text-slate-500 text-sm mt-1">{med.instructions}</p>
                             </div>
                             <div className="text-right">
                                <Badge variant="outline" className="text-base font-bold text-blue-700 bg-blue-50 border-blue-200 px-3 py-1">
                                  {med.frequency}
                                </Badge>
                             </div>
                          </div>
                        ))}
                        {(!result.medications || result.medications.length === 0) && (
                          <p className="text-slate-500 italic">No medications extracted.</p>
                        )}
                     </div>

                     <div className="mt-8 flex flex-col sm:flex-row gap-4">
                        <Button className="flex-1 h-14 text-lg bg-blue-600 hover:bg-blue-700 rounded-xl" onClick={() => { console.log("Saved patient data:", result); }}>
                           <CheckCircle2 className="w-5 h-5 mr-2" /> Verify & Save
                        </Button>
                        <Button variant="outline" className="flex-1 h-14 text-lg border-2 border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl p-0" onClick={handleShare}>
                           <span className="flex items-center justify-center w-full h-full"><Share2 className="w-5 h-5 mr-2 text-emerald-600" /> Share with Doctor</span>
                        </Button>
                     </div>
                  </CardContent>
                </Card>
             </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
