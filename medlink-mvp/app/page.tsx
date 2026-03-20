"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import imageCompression from "browser-image-compression";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, HeartPulse, CheckCircle2, AlertTriangle, Share2, ArrowLeft, Volume2, Info, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { db, auth, googleProvider } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, User } from "firebase/auth";

// ---------------------------------------------------------------------------
// Domain types — mirror the Zod ExtractionSchema in route.ts
// ---------------------------------------------------------------------------
interface PatientInfo {
  name: string;
  age?: number | null;
  gender?: string | null;
}

interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  instructions: string;
}

interface Vitals {
  bp?: string | null;
  pulse?: number | null;
  weight?: string | null;
}

interface ScanResult {
  patient_info: PatientInfo;
  medications: Medication[];
  vitals: Vitals;
  critical_alerts: string[];
  detected_language: string;
}

// ---------------------------------------------------------------------------
// Constants — outside component to avoid recreation on each render
// ---------------------------------------------------------------------------
// 1×1 transparent PNG used as the "Try Sample" demo payload
const SAMPLE_PRESCRIPTION_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

// Hard timeout for all Vertex AI fetch calls — prevents indefinite UI hangs
const FETCH_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function MedLinkFrontend() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle post-OAuth redirect (required for Cloud Run where signInWithPopup is
  // blocked by the browser Cross-Origin-Opener-Policy header). getRedirectResult
  // resolves to null on normal loads — safe to call unconditionally on mount.
  useEffect(() => {
    let unsub: (() => void) | undefined;

    getRedirectResult(auth)
      .then((redirectResult) => {
        if (redirectResult?.user) setUser(redirectResult.user);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Sign-in failed. Please try again.";
        setError(msg);
      })
      .finally(() => {
        // Start the persistent auth listener after redirect check resolves
        unsub = onAuthStateChanged(auth, (currentUser) => {
          setUser(currentUser);
          setAuthLoading(false);
        });
      });

    return () => unsub?.();
  }, []);

  // signInWithRedirect is the only reliable approach on deployed domains —
  // popups are blocked by COOP headers that Cloud Run sets by default.
  const handleLogin = useCallback(async () => {
    setError(null);
    try {
      await signInWithRedirect(auth, googleProvider);
      // Page navigates away to Google; no further code runs here.
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start sign-in.";
      setError(msg);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await signOut(auth);
    setResult(null);
    setFile(null);
    setIsSaved(false);
  }, []);

  const saveToFirestore = useCallback(async (scanResult: ScanResult): Promise<void> => {
    if (!user) return;
    try {
      await addDoc(collection(db, "scans"), {
        ...scanResult,
        userId: user.uid,
        userEmail: user.email,
        timestamp: serverTimestamp(),
        fileName: file?.name ?? "sample_prescription",
      });
    } catch (saveErr: unknown) {
      console.error("Firebase Firestore save error:", saveErr);
    }
  }, [user, file]);

  const handleSpeak = useCallback(() => {
    if (!result || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const patientName = result.patient_info?.name ?? "the patient";
    let speechText = `Patient summary for ${patientName}. `;

    if (result.critical_alerts.length > 0) {
      speechText += `Warning: There are ${result.critical_alerts.length} critical alerts. `;
      result.critical_alerts.forEach((alert) => { speechText += `${alert}. `; });
    }

    if (result.medications.length > 0) {
      speechText += `Found ${result.medications.length} medications. `;
      result.medications.forEach((med) => {
        speechText += `${med.name}, dosage is ${med.dosage}, frequency is ${med.frequency}. ${med.instructions}. `;
      });
    } else {
      speechText += "No medications detected.";
    }

    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend   = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [result]);

  // Centralised fetch helper with AbortController hard timeout
  const analyzeImage = useCallback(async (image: string, mimeType: string): Promise<ScanResult> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, mimeType }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to analyze the medical document.");
      return (data.data ?? data) as ScanResult;
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const handleTrySample = useCallback(async () => {
    setError(null);
    setLoading(true);
    setResult(null);
    setIsSaved(false);
    try {
      const scanData = await analyzeImage(SAMPLE_PRESCRIPTION_BASE64, "image/png");
      setResult(scanData);
      await saveToFirestore(scanData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }, [analyzeImage, saveToFirestore]);

  const processFile = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setLoading(true);
    setResult(null);
    setIsSaved(false);
    try {
      // Compress to ≤1 MB / ≤1600 px WebP before upload — reduces Vertex AI latency
      const compressedFile = await imageCompression(selectedFile, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: "image/webp",
      });

      const { base64Data, mimeType } = await new Promise<{ base64Data: string; mimeType: string }>(
        (resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(compressedFile);
          reader.onload = () => {
            resolve({ base64Data: (reader.result as string).split(",")[1], mimeType: "image/webp" });
          };
          reader.onerror = () => reject(new Error("Failed to read compressed file."));
        },
      );

      const scanData = await analyzeImage(base64Data, mimeType);
      setResult(scanData);
      await saveToFirestore(scanData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected network error occurred.");
    } finally {
      setLoading(false);
    }
  }, [analyzeImage, saveToFirestore]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) await processFile(e.target.files[0]);
  }, [processFile]);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) await processFile(e.dataTransfer.files[0]);
  }, [processFile]);

  const handleShare = useCallback(() => {
    if (!result) return;
    const text = [
      "*Med-Link Patient Summary*",
      `Name: ${result.patient_info?.name ?? "N/A"}`,
      `Age: ${result.patient_info?.age ?? "N/A"}`,
      `Gender: ${result.patient_info?.gender ?? "N/A"}`,
      "",
      "*Medications*:",
      ...result.medications.map((m) => `- ${m.name} (${m.dosage}) - ${m.frequency}`),
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }, [result]);

  const handleVerifyAndSave = useCallback(async () => {
    if (!result) return;
    await saveToFirestore(result);
    setIsSaved(true);
  }, [result, saveToFirestore]);

  const hasCriticalAlerts = (result?.critical_alerts.length ?? 0) > 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (authLoading) {
    return (
      <div
        className="min-h-screen bg-slate-50 flex items-center justify-center"
        role="status"
        aria-label="Loading Med-Link, please wait"
      >
        <HeartPulse className="w-16 h-16 text-blue-600 animate-pulse" aria-hidden="true" />
      </div>
    );
  }

  return (
    <>
      {/* Skip navigation — essential for keyboard & screen-reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-700 focus:text-white focus:rounded-lg"
      >
        Skip to main content
      </a>

      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
        <header
          className="bg-blue-700 text-white p-4 shadow-md sticky top-0 z-10 flex items-center justify-between px-6"
          role="banner"
        >
          <div className="w-10" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight">Med-Link MVP</h1>
          {user ? (
            <Button
              variant="ghost"
              className="text-white hover:bg-blue-800"
              onClick={handleLogout}
              aria-label="Sign out of Med-Link"
            >
              <LogOut className="w-5 h-5" aria-hidden="true" />
            </Button>
          ) : (
            <div className="w-10" aria-hidden="true" />
          )}
        </header>

        <main
          id="main-content"
          className="flex-1 container max-w-2xl mx-auto p-4 md:p-6 flex flex-col justify-center"
          role="main"
          aria-busy={loading}
        >
          <AnimatePresence mode="wait">

            {/* ── Login ────────────────────────────────────────────────── */}
            {!user && (
              <motion.div
                key="login"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center text-center space-y-8"
              >
                <div className="bg-white p-10 rounded-3xl shadow-xl border border-slate-100 max-w-sm w-full">
                  <div className="bg-blue-50 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6" aria-hidden="true">
                    <HeartPulse className="w-12 h-12 text-blue-600" aria-hidden="true" />
                  </div>
                  <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome Back</h2>
                  <p className="text-slate-500 mb-8">Sign in to securely access your medical document history.</p>
                  <Button
                    size="lg"
                    className="w-full h-14 text-lg rounded-xl bg-blue-700 hover:bg-blue-800 shadow-md font-bold"
                    onClick={handleLogin}
                    aria-label="Sign in with your Google account"
                  >
                    Sign in with Google
                  </Button>
                  {error && <p className="text-red-600 mt-4 font-medium" role="alert">{error}</p>}
                </div>
              </motion.div>
            )}

            {/* ── Upload ───────────────────────────────────────────────── */}
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
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  aria-label="Upload prescription image — click or drag and drop"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                >
                  <UploadCloud className="w-16 h-16 text-blue-500 mx-auto mb-4" aria-hidden="true" />
                  <p className="text-2xl font-semibold text-slate-800 mb-2">Upload Prescription</p>
                  <p className="text-slate-600 text-lg">Drag &amp; drop your medical document here, or tap to browse.</p>
                  <label htmlFor="prescription-upload" className="sr-only">Upload Prescription File</label>
                  <input
                    type="file"
                    id="prescription-upload"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                </div>

                <div className="flex flex-col w-full max-w-md space-y-4">
                  <Button
                    size="lg"
                    className="h-16 text-xl rounded-full bg-blue-700 hover:bg-blue-800 text-white shadow-lg"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Open file picker to scan a prescription"
                  >
                    Scan Prescription
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-12 text-lg rounded-full text-blue-700 border-blue-200 hover:bg-blue-50"
                    onClick={handleTrySample}
                    aria-label="Analyze a built-in sample prescription"
                  >
                    Try Sample
                  </Button>
                </div>

                {error && (
                  <div className="p-4 bg-red-100 text-red-800 border-2 border-red-200 rounded-xl w-full text-center font-bold" role="alert">
                    {error}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Loading ──────────────────────────────────────────────── */}
            {user && loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-20"
                role="status"
                aria-live="polite"
                aria-label="Reading prescription, please wait"
              >
                <HeartPulse className="w-24 h-24 text-blue-600 animate-pulse mb-6" aria-hidden="true" />
                <p className="text-2xl font-bold text-slate-800">Reading Prescription...</p>
                <p className="text-slate-600 mt-2 text-lg">Applying Multimodal AI Reasoning</p>
              </motion.div>
            )}

            {/* ── Results ──────────────────────────────────────────────── */}
            {user && result && !loading && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 pb-20"
                aria-live="polite"
              >
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    className="text-blue-700 text-lg p-0 hover:bg-transparent"
                    onClick={() => { setResult(null); setFile(null); setIsSaved(false); }}
                    aria-label="Go back and scan another prescription"
                  >
                    <ArrowLeft className="w-5 h-5 mr-2" aria-hidden="true" /> Scan Another
                  </Button>

                  {/* aria-pressed reflects the toggle state for screen readers */}
                  <Button
                    variant="outline"
                    className={`rounded-full h-12 w-12 p-0 border-blue-200 ${isSpeaking ? "bg-blue-100 ring-2 ring-blue-500" : ""}`}
                    onClick={handleSpeak}
                    aria-label={isSpeaking ? "Stop reading prescription aloud" : "Read prescription details aloud"}
                    aria-pressed={isSpeaking}
                  >
                    <Volume2 className={`w-6 h-6 ${isSpeaking ? "text-blue-700" : "text-slate-600"}`} aria-hidden="true" />
                  </Button>
                </div>

                {hasCriticalAlerts && (
                  <div
                    className="bg-red-50 border-l-4 border-red-600 p-4 rounded-r-lg flex items-start space-x-3 shadow-sm"
                    role="alert"
                    aria-labelledby="alerts-title"
                  >
                    <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <h3 id="alerts-title" className="text-red-900 font-bold text-lg">Critical Alerts</h3>
                      <ul className="list-disc pl-5 mt-1 text-red-800 font-medium">
                        {result.critical_alerts.map((alert, idx) => <li key={idx}>{alert}</li>)}
                      </ul>
                    </div>
                  </div>
                )}

                <Card className="shadow-lg border-t-4 border-t-blue-600 bg-white">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                      <CardTitle className="text-2xl text-slate-900">
                        {result.patient_info?.name ?? "Unknown Patient"}
                      </CardTitle>
                      <p
                        className="text-slate-600 font-medium text-lg"
                        aria-label={`Age ${result.patient_info?.age ?? "Unknown"}, Gender ${result.patient_info?.gender ?? "Unknown"}`}
                      >
                        Age: {result.patient_info?.age ?? "-"} | Gender: {result.patient_info?.gender ?? "-"}
                      </p>
                    </div>
                    <Badge
                      variant={hasCriticalAlerts ? "destructive" : "default"}
                      className={hasCriticalAlerts ? "text-base px-3 py-1 font-bold" : "bg-emerald-600 hover:bg-emerald-700 text-base px-3 py-1 font-bold text-white"}
                      role="status"
                      aria-label={`Patient status: ${hasCriticalAlerts ? "Critical" : "Stable"}`}
                    >
                      {hasCriticalAlerts ? "Critical" : "Stable"}
                    </Badge>
                  </CardHeader>

                  <CardContent className="pt-4">
                    <div className="grid grid-cols-3 gap-4 mb-6" role="group" aria-label="Patient Vitals">
                      <div className="bg-slate-100 p-3 rounded-lg text-center" aria-label={`Blood Pressure: ${result.vitals?.bp ?? "Not detected"}`}>
                        <span className="block text-slate-600 text-sm font-bold uppercase tracking-wide">BP</span>
                        <span className="text-xl font-bold text-slate-900">{result.vitals?.bp ?? "-"}</span>
                      </div>
                      <div className="bg-slate-100 p-3 rounded-lg text-center" aria-label={`Pulse: ${result.vitals?.pulse ?? "Not detected"}`}>
                        <span className="block text-slate-600 text-sm font-bold uppercase tracking-wide">Pulse</span>
                        <span className="text-xl font-bold text-slate-900">{result.vitals?.pulse ?? "-"}</span>
                      </div>
                      <div className="bg-slate-100 p-3 rounded-lg text-center" aria-label={`Weight: ${result.vitals?.weight ?? "Not detected"}`}>
                        <span className="block text-slate-600 text-sm font-bold uppercase tracking-wide">Weight</span>
                        <span className="text-xl font-bold text-slate-900">{result.vitals?.weight ?? "-"}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-4 border-b pb-2">
                      <h3 className="text-xl font-bold text-slate-800">Medications</h3>
                      <Info className="w-5 h-5 text-slate-400" aria-hidden="true" />
                    </div>

                    <ul className="space-y-4" aria-label="Medication list">
                      {result.medications.map((med, idx) => (
                        <li key={idx} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-200">
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
                        </li>
                      ))}
                      {result.medications.length === 0 && (
                        <li className="text-slate-600 italic">No medications extracted.</li>
                      )}
                    </ul>

                    <div className="mt-8 flex flex-col sm:flex-row gap-4">
                      <Button
                        className={`flex-1 h-16 text-xl rounded-2xl shadow-md border-none font-black transition-colors ${isSaved ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-blue-700 hover:bg-blue-800 text-white"}`}
                        onClick={handleVerifyAndSave}
                        aria-label={isSaved ? "Record saved to your history" : "Verify and save this scan to your history"}
                        disabled={isSaved}
                      >
                        <CheckCircle2 className="w-6 h-6 mr-2" aria-hidden="true" />
                        {isSaved ? "Saved to History" : "Verify & Save"}
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 h-16 text-xl border-2 border-slate-300 text-slate-800 hover:bg-slate-50 rounded-2xl"
                        onClick={handleShare}
                        aria-label="Share patient summary with doctor via WhatsApp"
                      >
                        <Share2 className="w-6 h-6 mr-2 text-emerald-700" aria-hidden="true" />
                        Share
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>
    </>
  );
}
