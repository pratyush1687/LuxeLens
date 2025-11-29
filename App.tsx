import React, { useState, useEffect, useCallback } from 'react';
import { AppState, JewelryAnalysis, GeneratedImage } from './types';
import FileUpload from './components/FileUpload';
import ScenarioCard from './components/ScenarioCard';
import { analyzeJewelryImage, generateJewelryRendition } from './services/geminiService';

const App: React.FC = () => {
  // State
  const [appState, setAppState] = useState<AppState>(AppState.API_KEY_SELECTION);
  const [jewelryFile, setJewelryFile] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<JewelryAnalysis | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Initialize API Key check
  const checkApiKey = useCallback(async () => {
    try {
      const aistudio = (window as any).aistudio;
      if (aistudio && await aistudio.hasSelectedApiKey()) {
        setAppState(AppState.UPLOAD);
      } else {
        setAppState(AppState.API_KEY_SELECTION);
      }
    } catch (e) {
      console.error("Error checking API key", e);
    }
  }, []);

  useEffect(() => {
    checkApiKey();
  }, [checkApiKey]);

  const handleApiKeySelect = async () => {
    try {
      const aistudio = (window as any).aistudio;
      if (aistudio) {
        await aistudio.openSelectKey();
        // Assume success and proceed, handling race condition by just moving forward
        setAppState(AppState.UPLOAD);
      }
    } catch (e) {
      setError("Failed to select API Key. Please try again.");
    }
  };

  const startGeneration = async () => {
    if (!jewelryFile || !logoFile) {
      setError("Please upload both jewelry image and logo.");
      return;
    }

    setAppState(AppState.ANALYZING);
    setError(null);

    try {
      // 1. Analyze Image
      const analysisResult = await analyzeJewelryImage(jewelryFile);
      setAnalysis(analysisResult);
      
      // Initialize placeholders for images
      const scenarios = [
        "Black Satin Background",
        "White Satin Background",
        "Top View",
        "Front View",
        "Side View",
        "Model Shot"
      ];

      const initialImages: GeneratedImage[] = scenarios.map(s => ({
        id: Math.random().toString(36).substr(2, 9),
        url: '',
        scenario: s,
        status: 'pending'
      }));

      setGeneratedImages(initialImages);
      setAppState(AppState.RESULTS); // Move to results view to show progress

      // 2. Trigger Generations in parallel
      generateAllScenarios(jewelryFile, logoFile, analysisResult, initialImages);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to analyze image. Please try another photo.");
      setAppState(AppState.UPLOAD);
    }
  };

  const generateAllScenarios = async (
    jFile: string, 
    lFile: string, 
    analysisData: JewelryAnalysis,
    placeholders: GeneratedImage[]
  ) => {
    // Process all scenarios in parallel
    // Since RPM is 20, firing 6 requests at once is safe.
    // We add a small stagger delay to avoid browser connection limits or burst QPS blocks.
    const promises = placeholders.map(async (item, index) => {
      // Stagger start times by 250ms
      await new Promise(resolve => setTimeout(resolve, index * 250));

      try {
        let prompt = "";
        
        // Custom Prompt Logic based on Scenario & Analysis
        if (item.scenario === "Black Satin Background") {
          prompt = `A ultra-luxurious commercial product shot of the jewelry on an elegant, slightly rippled black satin display stand. Dramatic cinematic lighting with high contrast. The metal should gleam against the dark background. 8k resolution, highly detailed.`;
        } else if (item.scenario === "White Satin Background") {
          prompt = `A clean, high-key commercial product shot of the jewelry on a pristine white satin surface. Soft, bright, diffuse lighting (softbox). Pure white aesthetic, sharp details.`;
        } else if (item.scenario === "Top View") {
          prompt = `A perfect symmetrical top-down flat lay view of the jewelry on a neutral, textured matte background. Even lighting, no hard shadows. Technical catalog style photography.`;
        } else if (item.scenario === "Front View") {
          prompt = `A direct front-facing eye-level shot of the jewelry on a professional invisible ghost mannequin or stand. Showcasing the main gemstones and setting details clearly. Depth of field f/11.`;
        } else if (item.scenario === "Side View") {
          prompt = `A profile side view macro shot of the jewelry showing the depth of the setting, prongs, and gallery. Shallow depth of field (f/2.8) blurring the background, focus sharp on the metalwork.`;
        } else if (item.scenario === "Model Shot") {
          // Complex logic for model shot
          if (analysisData.category === 'Ring') {
            prompt = `A hyper-realistic close-up of a hand with natural skin texture wearing the ring. The hand is posed elegantly. Soft natural light. Focus is strictly on the ring.`;
          } else {
             const attire = analysisData.recommendedAttire === 'Indian Traditional' 
               ? "wearing an exquisite silk Indian Saree with traditional gold embroidery" 
               : "wearing a sophisticated high-fashion western evening gown";
             prompt = `A fashion editorial portrait of a beautiful model ${attire} wearing the jewelry. The jewelry is the focal point. Professional fashion photography, Vogue style, realistic skin texture, realistic hair.`;
          }
        }

        // Generate with new service (2K resolution handled internally)
        const generatedUrl = await generateJewelryRendition(jFile, lFile, analysisData, prompt);

        setGeneratedImages(prev => prev.map(img => 
          img.id === item.id ? { ...img, url: generatedUrl, status: 'completed' } : img
        ));

      } catch (e) {
        console.error(`Failed to generate ${item.scenario}`, e);
        setGeneratedImages(prev => prev.map(img => 
          img.id === item.id ? { ...img, status: 'failed' } : img
        ));
      }
    });

    await Promise.all(promises);
  };

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = async () => {
    const completedImages = generatedImages.filter(img => img.status === 'completed');
    if (completedImages.length === 0) return;

    // Provide visual feedback (optional but good practice)
    for (const img of completedImages) {
      handleDownload(img.url, `luxelens-${img.scenario.replace(/\s+/g, '-').toLowerCase()}.png`);
      // Add a delay between downloads to ensure browser doesn't block multiples
      await new Promise(r => setTimeout(r, 600));
    }
  };

  const reset = () => {
    setAppState(AppState.UPLOAD);
    setJewelryFile(null);
    setLogoFile(null);
    setGeneratedImages([]);
    setAnalysis(null);
  };

  // --- RENDER HELPERS ---

  if (appState === AppState.API_KEY_SELECTION) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-stone-100 text-center">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
             <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
          </div>
          <h1 className="text-3xl font-serif font-bold text-stone-900 mb-2">LuxeLens AI Studio</h1>
          <p className="text-stone-500 mb-8">
            Professional Jewelry Photography Generation powered by Nano Banana Pro (Gemini 3 Pro).
            Please select a paid API key to continue.
          </p>
          <button 
            onClick={handleApiKeySelect}
            className="w-full bg-stone-900 hover:bg-stone-800 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            Select API Key
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
           <div className="mt-6 text-xs text-stone-400">
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-600">
              View Billing Documentation
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={reset}>
             <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center text-white">
               <span className="font-serif font-bold text-lg">L</span>
             </div>
             <span className="font-serif font-bold text-xl tracking-tight text-stone-900">LuxeLens</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        {/* Error Message */}
        {error && (
          <div className="mb-8 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg flex items-center gap-2 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}

        {/* Upload View */}
        {appState === AppState.UPLOAD && (
          <div className="max-w-3xl mx-auto animate-fade-in">
            <div className="text-center mb-10">
              <h2 className="text-4xl font-serif font-bold text-stone-900 mb-4">Create Studio Quality Assets</h2>
              <p className="text-lg text-stone-600">Upload your product photo and logo. We'll handle the lighting, staging, and models using the high-fidelity Nano Banana Pro engine.</p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <FileUpload 
                  id="jewelry-upload"
                  label="1. Product Photograph" 
                  preview={jewelryFile} 
                  onChange={(_, base64) => setJewelryFile(base64)} 
                />
                <FileUpload 
                  id="logo-upload"
                  label="2. Brand Logo (Transparent PNG)" 
                  preview={logoFile} 
                  onChange={(_, base64) => setLogoFile(base64)} 
                />
              </div>

              <button
                onClick={startGeneration}
                disabled={!jewelryFile || !logoFile}
                className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 ${
                  !jewelryFile || !logoFile
                    ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                    : 'bg-stone-900 text-white hover:bg-stone-800 hover:shadow-xl'
                }`}
              >
                <span>Generate Studio Assets (2K)</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H5"/><path d="M21 16h-2"/><path d="M16 19h2"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* Analyzing View */}
        {appState === AppState.ANALYZING && (
          <div className="max-w-lg mx-auto text-center mt-20">
             <div className="w-16 h-16 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin mx-auto mb-6"></div>
             <h3 className="text-2xl font-serif font-bold text-stone-900 mb-2">Analyzing your jewelry...</h3>
             <p className="text-stone-500">identifying materials, style, and category to tailor the perfect photoshoot.</p>
          </div>
        )}

        {/* Results View */}
        {appState === AppState.RESULTS && (
          <div className="animate-fade-in">
             <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
               <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-serif font-bold text-stone-900">Production Gallery</h2>
                    <span className="px-2 py-0.5 bg-stone-900 text-stone-50 text-xs font-semibold rounded uppercase tracking-wider">Nano Banana Pro</span>
                  </div>
                  
                  {analysis && (
                    <div className="flex flex-wrap gap-2 text-sm">
                      <span className="px-3 py-1 bg-amber-50 text-amber-800 rounded-full border border-amber-100 font-medium">
                        {analysis.category}
                      </span>
                      <span className="px-3 py-1 bg-stone-50 text-stone-600 rounded-full border border-stone-100">
                        {analysis.style}
                      </span>
                      <span className="px-3 py-1 bg-stone-50 text-stone-600 rounded-full border border-stone-100 hidden sm:inline-block">
                        {analysis.recommendedAttire}
                      </span>
                    </div>
                  )}
               </div>

               <div className="flex flex-wrap items-center gap-3">
                 <button onClick={reset} className="px-5 py-2.5 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-100 border border-stone-200 transition-colors">
                   New Project
                 </button>
                 
                 {generatedImages.some(img => img.status === 'completed') && (
                    <button 
                      onClick={handleDownloadAll}
                      className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Download All Assets
                    </button>
                 )}
               </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {generatedImages.map((img) => (
                 <ScenarioCard key={img.id} item={img} onDownload={handleDownload} />
               ))}
             </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;