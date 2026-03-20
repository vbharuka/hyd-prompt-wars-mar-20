"use client";

import { useState, useRef, useEffect } from "react";
import imageCompression from "browser-image-compression";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, HeartPulse, CheckCircle2, AlertTriangle, Share2, ArrowLeft, Volume2, Info, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { db, auth, googleProvider } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { signInWithPopup, onAuthStateChanged, signOut, User } from "firebase/auth";

export default function MedLinkFrontend() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError("Failed to sign in with Google.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setResult(null);
    setFile(null);
  };

  const saveToFirestore = async (scanResult: any) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "scans"), {
        ...scanResult,
        userId: user.uid,
        userEmail: user.email,
        timestamp: serverTimestamp(),
        fileName: file?.name || "sample_prescription"
      });
      console.log("Successfully saved scan to Firestore history.");
    } catch (saveErr: any) {
      console.error("Firebase error while saving scan:", saveErr);
    }
  };

  const SAMPLE_PRESCRIPTION_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; 

  const handleSpeak = () => {
    if (!result || !window.speechSynthesis) return;
    
    // Stop any current speech
    window.speechSynthesis.cancel();

    const patientName = result.patient_info?.name || "the patient";
    const medicationsCount = result.medications?.length || 0;
    
    let speechText = `Patient summary for ${patientName}. `;
    if (result.critical_alerts && result.critical_alerts.length > 0) {
      speechText += `Warning: There are ${result.critical_alerts.length} critical alerts. `;
      result.critical_alerts.forEach((alert: string) => {
        speechText += `${alert}. `;
      });
    }

    if (medicationsCount > 0) {
      speechText += `Found ${medicationsCount} medications. `;
      result.medications.forEach((med: any) => {
        speechText += `${med.name}, dosage is ${med.dosage}, frequency is ${med.frequency}. ${med.instructions}. `;
      });
    } else {
      speechText += "No medications detected.";
    }

    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  };

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
        const scanData = data.data || data;
        setResult(scanData);
        await saveToFirestore(scanData);
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
          // Efficient Edge Optimization: Resize and compress image to <1600px WebP before upload
          const compressionOptions = {
              maxSizeMB: 1,
              maxWidthOrHeight: 1600,
              useWebWorker: true,
              fileType: "image/webp"
          };
          
          const compressedFile = await imageCompression(selectedFile, compressionOptions);
          
          const { base64Data, mimeType } = await new Promise<{base64Data: string, mimeType: string}>((resolve, reject) => {
              const reader = new FileReader();
              reader.readAsDataURL(compressedFile);
              reader.onload = () => {
                  const base64String = reader.result as string;
                  const parsedMimeType = "image/webp";
                  const parsedBase64Data = base64String.split(",")[1];
                  resolve({ base64Data: parsedBase64Data, mimeType: parsedMimeType });
              };
              reader.onerror = () => reject(new Error("Failed to read compressed file."));
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
  
          const scanData = data.data || data;
          setResult(scanData);
          await saveToFirestore(scanData);
      } catch (err: any) {
          setError(err.message || "An unexpected network error occurred.");
      } finally {
          setLoading(false);
      }
  };

  const handleShare = () => {
    if (!result) return;
    const text = `*Med-Link Patient Summary*\nName: ${result.patient_info?.name || "N/A"}\nAge: ${result.patient_info?.age || "N/A"}\nGender: ${result.patient_info?.gender || "N/A"}\n\n*Medications*:\n${result.medications?.map((m: any) => `- ${m.name} (${m.dosage}) - ${m.frequency}`).join("\n")}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const hasCriticalAlerts = result?.critical_alerts && result.critical_alerts.length > 0;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <HeartPulse className="w-16 h-16 text-blue-600 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="bg-blue-700 text-white p-4 shadow-md sticky top-0 z-10 flex items-center justify-between px-6" role="banner">
         <div className="w-10"></div>
         <h1 className="text-2xl font-bold tracking-tight">Med-Link MVP</h1>
         {user ? (
           <Button variant="ghost" className="text-white hover:bg-blue-800" onClick={handleLogout} aria-label="Sign out">
             <LogOut className="w-5 h-5" />
           </Button>
         ) : <div className="w-10"></div>}
      </header>

      <main className="flex-1 container max-w-2xl mx-auto p-4 md:p-6 flex flex-col justify-center" role="main">
        <AnimatePresence mode="wait">
          {!user && (
            <motion.div
              key="login"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center text-center space-y-8"
            >
              <div className="bg-white p-10 rounded-3xl shadow-xl border border-slate-100 max-w-sm w-full">
                <div className="bg-blue-50 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <HeartPulse className="w-12 h-12 text-blue-600" />
                </div>
                <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome Back</h2>
                <p className="text-slate-500 mb-8">Sign in to securely access your medical document history.</p>
                <Button 
                  size="lg" 
                  className="w-full h-14 text-lg rounded-xl bg-blue-700 hover:bg-blue-800 shadow-md font-bold"
                  onClick={handleLogin}
                >
                  Sign in with Google
                </Button>
                {error && <p className="text-red-600 mt-4 font-medium">{error}</p>}
              </div>
            </motion.div>
          )}

          {user && !result && !loading && (
            <motion.div
              key="scan"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center space-y-8 py-10"
            >
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold text-slate-800">Hello, {user.displayName?.split(" ")[0]}</h2>
                <p className="text-slate-500">Ready to decipher a new prescription?</p>
              </div>

              <div 
                className="w-full border-4 border-dashed border-blue-200 hover:border-blue-400 bg-white rounded-2xl p-12 text-center cursor-pointer transition-colors shadow-sm focus-within:ring-2 focus-within:ring-blue-500 outline-none"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e)}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                aria-label="Upload prescription image"
                tabIndex={0}
                onKeyDown={(e) => { if(e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
              >
                <UploadCloud className="w-16 h-16 text-blue-500 mx-auto mb-4" aria-hidden="true" />
                <h2 className="text-2xl font-semibold text-slate-800 mb-2">Upload Prescription</h2>
                <p className="text-slate-600 text-lg">Drag & drop your medical document here, or tap to browse.</p>
                <label htmlFor="prescription-upload" className="sr-only">Upload Prescription File</label>
                <input 
                  type="file" 
                  id="prescription-upload"
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*"
                  onChange={(e) => handleFileChange(e)}
                  aria-hidden="true"
                />
              </div>

              <div className="flex flex-col w-full max-w-md space-y-4">
                <Button 
                  size="lg" 
                  className="h-16 text-xl rounded-full bg-blue-700 hover:bg-blue-800 text-white shadow-lg"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Scan Prescription"
                >
                  Scan Prescription
                </Button>

                <Button 
                  variant="outline"
                  size="lg" 
                  className="h-12 text-lg rounded-full text-blue-700 border-blue-200 hover:bg-blue-50"
                  onClick={handleTrySample}
                  aria-label="Try Sample Prescription"
                >
                  Try Sample
                </Button>
              </div>

              {error && (
                <div 
                  className="p-4 bg-red-100 text-red-800 border-2 border-red-200 rounded-xl w-full text-center font-bold" 
                  role="alert"
                >
                  {error}
                </div>
              )}
            </motion.div>
          )}

          {user && loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20"
              aria-live="assertive"
            >
              <HeartPulse className="w-24 h-24 text-blue-600 animate-pulse mb-6" aria-hidden="true" />
              <h2 className="text-2xl font-bold text-slate-800">Reading Prescription...</h2>
              <p className="text-slate-600 mt-2 text-lg">Applying Multimodal AI Reasoning</p>
            </motion.div>
          )}

          {user && result && !loading && (
             <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6 pb-20"
              aria-live="polite"
             >
                <div className="flex items-center justify-between">
                  <Button variant="ghost" className="text-blue-700 text-lg p-0 hover:bg-transparent" onClick={() => { setResult(null); setFile(null); }} aria-label="Go back to scan another">
                     <ArrowLeft className="w-5 h-5 mr-2" /> Scan Another
                  </Button>
                  <Button 
                    variant="outline" 
                    className={`rounded-full h-12 w-12 p-0 border-blue-200 ${isSpeaking ? "bg-blue-100 ring-2 ring-blue-500" : ""}`}
                    onClick={handleSpeak}
                    aria-label="Listen to prescription details"
                  >
                    <Volume2 className={`w-6 h-6 ${isSpeaking ? "text-blue-700" : "text-slate-600"}`} />
                  </Button>
                </div>

                {hasCriticalAlerts && (
                  <div className="bg-red-50 border-l-4 border-red-600 p-4 rounded-r-lg flex items-start space-x-3 shadow-sm" role="alert" aria-labelledby="alerts-title">
                    <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <h3 id="alerts-title" className="text-red-900 font-bold text-lg">Critical Alerts present</h3>
                      <ul className="list-disc pl-5 mt-1 text-red-800 font-medium">
                        {result.critical_alerts.map((alert: string, idx: number) => (
                           <li key={idx}>{alert}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <Card className="shadow-lg border-t-4 border-t-blue-600 bg-white">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                       <CardTitle className="text-2xl text-slate-900" tabIndex={0}>{result.patient_info?.name || "Unknown Patient"}</CardTitle>
                       <p className="text-slate-600 font-medium text-lg" aria-label={`Age ${result.patient_info?.age || "Unknown"}, Gender ${result.patient_info?.gender || "Unknown"}`}>
                          Age: {result.patient_info?.age || "-"} | Gender: {result.patient_info?.gender || "-"}
                       </p>
                    </div>
                    <Badge variant={hasCriticalAlerts ? "destructive" : "default"} className={hasCriticalAlerts ? "text-base px-3 py-1 font-bold" : "bg-emerald-600 hover:bg-emerald-700 text-base px-3 py-1 font-bold text-white"}>
                       {hasCriticalAlerts ? "Critical" : "Stable"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="pt-4">
                     {/* Vitals */}
                     <div className="grid grid-cols-3 gap-4 mb-6" role="group" aria-label="Patient Vitals">
                        <div className="bg-slate-100 p-3 rounded-lg text-center" aria-label={`Blood Pressure: ${result.vitals?.bp || "Not detected"}`}>
                           <span className="block text-slate-600 text-sm font-bold uppercase tracking-wide">BP</span>
                           <span className="text-xl font-bold text-slate-900">{result.vitals?.bp || "-"}</span>
                        </div>
                        <div className="bg-slate-100 p-3 rounded-lg text-center" aria-label={`Pulse: ${result.vitals?.pulse || "Not detected"}`}>
                           <span className="block text-slate-600 text-sm font-bold uppercase tracking-wide">Pulse</span>
                           <span className="text-xl font-bold text-slate-900">{result.vitals?.pulse || "-"}</span>
                        </div>
                        <div className="bg-slate-100 p-3 rounded-lg text-center" aria-label={`Weight: ${result.vitals?.weight || "Not detected"}`}>
                           <span className="block text-slate-600 text-sm font-bold uppercase tracking-wide">Weight</span>
                           <span className="text-xl font-bold text-slate-900">{result.vitals?.weight || "-"}</span>
                        </div>
                     </div>

                     <div className="flex items-center justify-between mb-4 border-b pb-2">
                        <h3 className="text-xl font-bold text-slate-800">Medications</h3>
                        <Info className="w-5 h-5 text-slate-400" aria-hidden="true" />
                     </div>

                     <div className="space-y-4" role="list">
                        {result.medications?.map((med: any, idx: number) => (
                          <div key={idx} role="listitem" className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-200">
                             <div className="flex-1">
                                <h4 className="font-bold text-slate-900 text-lg leading-tight">{med.name}</h4>
                                <div className="flex items-center space-x-2 mt-1">
                                  <span className="text-slate-700 font-bold">Dosage:</span>
                                  <span className="text-slate-800">{med.dosage}</span>
                                </div>
                                <p className="text-slate-700 text-sm mt-1 italic">{med.instructions}</p>
                             </div>
                             <div className="text-right ml-4">
                                <Badge variant="outline" className="text-base font-black text-blue-800 bg-blue-50 border-blue-300 px-3 py-1">
                                  {med.frequency}
                                </Badge>
                             </div>
                          </div>
                        ))}
                        {(!result.medications || result.medications.length === 0) && (
                          <p className="text-slate-600 italic">No medications extracted.</p>
                        )}
                     </div>

                     <div className="mt-8 flex flex-col sm:flex-row gap-4">
                        <Button className="flex-1 h-16 text-xl bg-blue-700 hover:bg-blue-800 rounded-2xl shadow-md text-white border-none font-black" onClick={() => { console.log("Saved patient data:", result); }} aria-label="Confirm medical data and save to record">
                           <CheckCircle2 className="w-6 h-6 mr-2" /> Verify & Save
                        </Button>
                        <Button variant="outline" className="flex-1 h-16 text-xl border-2 border-slate-300 text-slate-800 hover:bg-slate-50 rounded-2xl" onClick={handleShare} aria-label="Share summary with doctor via WhatsApp">
                           <Share2 className="w-6 h-6 mr-2 text-emerald-700" /> Share
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

