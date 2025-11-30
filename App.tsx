import React, { useState, useEffect, useCallback } from 'react';
import { AppState, JewelryAnalysis, GeneratedImage, Project } from './types';
import FileUpload from './components/FileUpload';
import ScenarioCard from './components/ScenarioCard';
import CropModal from './components/CropModal';
import { analyzeJewelryImage, generateJewelryRendition, editGeneratedImage, generateVirtualTryOn } from './services/geminiService';
import { saveProjectToHistory, getProjectHistory, deleteProjectFromHistory, savePreferredLogo, getPreferredLogo } from './services/dbService';

// Mi OMORFIA Branding Component
const MiOmorfiaLogo = () => (
  <div className="flex flex-col items-center justify-center">
    <div className="flex items-baseline justify-center relative">
      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 text-amber-500">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
           <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
        </svg>
      </div>
      <span className="font-script text-4xl md:text-5xl text-stone-900 leading-none mr-2">Mi</span>
      <span className="font-serif text-2xl md:text-3xl tracking-widest text-stone-900 leading-none">OMORFIA</span>
    </div>
    <div className="w-full h-px bg-gradient-to-r from-transparent via-amber-400 to-transparent my-1"></div>
    <span className="text-[9px] md:text-[10px] tracking-[0.4em] text-amber-700 uppercase font-serif">Jewelry with Style</span>
  </div>
);

// Simplified Logo for small headers
const MiOmorfiaLogoSmall = () => (
  <div className="flex items-center gap-2">
    <span className="font-script text-3xl text-stone-900">Mi</span>
    <div className="flex flex-col items-start">
      <span className="font-serif text-lg tracking-widest text-stone-900 leading-none">OMORFIA</span>
      <span className="text-[7px] tracking-[0.2em] text-amber-600 uppercase">Jewelry with Style</span>
    </div>
  </div>
);

const App: React.FC = () => {
  // State
  const [appState, setAppState] = useState<AppState>(AppState.API_KEY_SELECTION);
  const [jewelryFile, setJewelryFile] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<string | null>(null);
  const [jewelrySize, setJewelrySize] = useState<string>('');
  
  // Try-On State
  const [userModelFile, setUserModelFile] = useState<string | null>(null);
  const [tryOnResult, setTryOnResult] = useState<string | null>(null);
  const [isTryOnLoading, setIsTryOnLoading] = useState(false);

  // Crop State
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState<'jewelry' | 'model' | null>(null);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<JewelryAnalysis | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Initialize API Key check and Load Logo
  const checkApiKey = useCallback(async () => {
    try {
      // Load logo from DB
      const savedLogo = await getPreferredLogo();
      if (savedLogo) {
        setLogoFile(savedLogo);
      }

      // 1. Check if environment variable is already populated (Deployment support)
      if (process.env.API_KEY) {
        setAppState(AppState.UPLOAD);
        return;
      }

      // 2. Check aistudio helper (IDX support)
      const aistudio = (window as any).aistudio;
      if (aistudio && await aistudio.hasSelectedApiKey()) {
        setAppState(AppState.UPLOAD);
      } else {
        setAppState(AppState.API_KEY_SELECTION);
      }
    } catch (e) {
      console.error("Error initializing app", e);
      setAppState(AppState.API_KEY_SELECTION);
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
      }
      setAppState(AppState.UPLOAD);
    } catch (e) {
      console.error("Failed to select API Key", e);
      setAppState(AppState.UPLOAD);
    }
  };

  const handleLogoChange = async (file: File | null, base64: string | null) => {
    setLogoFile(base64);
    if (base64) {
      try {
        await savePreferredLogo(base64);
      } catch (e) {
        console.error("Failed to save logo preference", e);
      }
    }
  };

  const startGeneration = async () => {
    if (!jewelryFile) {
      setError("Please upload a jewelry image.");
      return;
    }

    setAppState(AppState.ANALYZING);
    setError(null);
    setCurrentProjectId(null); // Reset current project ID for new batch

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
      generateAllScenarios(jewelryFile, logoFile, analysisResult, initialImages, jewelrySize);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to analyze image. Please try another photo.");
      setAppState(AppState.UPLOAD);
    }
  };

  const generateAllScenarios = async (
    jFile: string, 
    lFile: string | null, 
    analysisData: JewelryAnalysis,
    placeholders: GeneratedImage[],
    sizeStr?: string
  ) => {
    // Process all scenarios in parallel
    // Since RPM limits can be strict for complex image generation, we stagger requests significantly.
    const promises = placeholders.map(async (item, index) => {
      // Stagger start times by 2 seconds to avoid 429 bursts
      // T0, T+2s, T+4s, etc.
      await new Promise(resolve => setTimeout(resolve, index * 2000));

      try {
        let prompt = "";
        let isModelShot = false;
        
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
          isModelShot = true;
          if (analysisData.category === 'Ring') {
            prompt = `A hyper-realistic close-up of a hand with natural skin texture wearing the ring. The hand is posed elegantly. Soft natural light. Focus is strictly on the ring.`;
          } else {
             const attire = analysisData.recommendedAttire === 'Indian Traditional' 
               ? "wearing an exquisite silk Indian Saree with traditional gold embroidery" 
               : "wearing a sophisticated high-fashion western evening gown";
             prompt = `A fashion editorial portrait of a beautiful model ${attire} wearing the jewelry. The jewelry is the focal point. Professional fashion photography, Vogue style, realistic skin texture, realistic hair.`;
          }
        }

        // Generate with service (Flash for products, Pro for models)
        const generatedUrl = await generateJewelryRendition(jFile, lFile, analysisData, prompt, sizeStr, isModelShot);

        const updatedItem: GeneratedImage = { ...item, url: generatedUrl, status: 'completed' };
        
        setGeneratedImages(prev => prev.map(img => 
          img.id === item.id ? updatedItem : img
        ));

        return updatedItem;

      } catch (e) {
        console.error(`Failed to generate ${item.scenario}`, e);
        const failedItem: GeneratedImage = { ...item, status: 'failed' };
        setGeneratedImages(prev => prev.map(img => 
          img.id === item.id ? failedItem : img
        ));
        return failedItem;
      }
    });

    const results = await Promise.all(promises);
    
    // Auto-save project
    const newProjectId = Date.now().toString();
    const newProject: Project = {
      id: newProjectId,
      timestamp: Date.now(),
      jewelryFile: jFile,
      logoFile: lFile,
      jewelrySize: sizeStr,
      analysis: analysisData,
      images: results
    };
    
    try {
      await saveProjectToHistory(newProject);
      setCurrentProjectId(newProjectId); // Track ID so we can update it later if edited
      console.log("Project auto-saved to history");
    } catch (saveError) {
      console.error("Failed to auto-save project", saveError);
    }
  };

  const handleEditImage = async (id: string, prompt: string) => {
    const targetImage = generatedImages.find(img => img.id === id);
    if (!targetImage || !targetImage.url) return;

    // 1. Optimistic Update: Set status to pending
    setGeneratedImages(prev => prev.map(img => 
      img.id === id ? { ...img, status: 'pending' } : img
    ));

    try {
      // 2. Call API
      const newUrl = await editGeneratedImage(targetImage.url, prompt);
      
      const updatedItem: GeneratedImage = { 
        ...targetImage, 
        url: newUrl, 
        status: 'completed' 
      };

      // 3. Update State
      setGeneratedImages(prev => prev.map(img => 
        img.id === id ? updatedItem : img
      ));

      // 4. Update History persistence if we have a current project
      if (currentProjectId) {
         // We need to construct the updated project object to save it
         const updatedImagesList = generatedImages.map(img => img.id === id ? updatedItem : img);
         
         if (jewelryFile && analysis) {
           const updatedProject: Project = {
             id: currentProjectId,
             timestamp: Date.now(), // update timestamp on edit
             jewelryFile: jewelryFile,
             logoFile: logoFile,
             jewelrySize: jewelrySize,
             analysis: analysis,
             images: updatedImagesList
           };
           await saveProjectToHistory(updatedProject);
           // Also update projects list if in history view
           setProjects(prev => prev.map(p => p.id === currentProjectId ? updatedProject : p));
         }
      }

    } catch (e) {
      console.error("Failed to edit image", e);
      setGeneratedImages(prev => prev.map(img => 
        img.id === id ? { ...img, status: 'failed' } : img
      ));
    }
  };

  // --- Crop Handlers ---
  const initiateCrop = (target: 'jewelry' | 'model') => {
    if (target === 'jewelry' && jewelryFile) {
      setImageToCrop(jewelryFile);
      setCropTarget('jewelry');
      setCropModalOpen(true);
    } else if (target === 'model' && userModelFile) {
      setImageToCrop(userModelFile);
      setCropTarget('model');
      setCropModalOpen(true);
    }
  };

  const handleCropComplete = (croppedBase64: string) => {
    if (cropTarget === 'jewelry') {
      setJewelryFile(croppedBase64);
    } else if (cropTarget === 'model') {
      setUserModelFile(croppedBase64);
    }
    // Close modal handled by component or here? Component handles UI close call, we reset state
    // But modal needs explicit close prop action
    // We update the file state, so the UI will reflect the cropped version
  };

  const handleTryOnGeneration = async () => {
    if (!jewelryFile || !userModelFile) return;
    
    setIsTryOnLoading(true);
    setTryOnResult(null);
    setError(null);

    try {
      // Use existing analysis if available, otherwise default to "jewelry"
      const category = analysis?.category || "jewelry item";
      const resultUrl = await generateVirtualTryOn(jewelryFile, userModelFile, category);
      setTryOnResult(resultUrl);
    } catch (e: any) {
      console.error("Try-on failed", e);
      setError("Failed to generate Virtual Try-On. Please ensure both images are clear.");
    } finally {
      setIsTryOnLoading(false);
    }
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

    for (const img of completedImages) {
      handleDownload(img.url, `miomorfia-${img.scenario.replace(/\s+/g, '-').toLowerCase()}.png`);
      await new Promise(r => setTimeout(r, 600));
    }
  };

  const loadHistory = async () => {
    try {
      const data = await getProjectHistory();
      setProjects(data);
      setAppState(AppState.HISTORY);
    } catch (e) {
      console.error("Failed to load history", e);
      setError("Could not load project history.");
    }
  };

  const restoreProject = (project: Project) => {
    setJewelryFile(project.jewelryFile);
    setLogoFile(project.logoFile);
    setJewelrySize(project.jewelrySize || '');
    setAnalysis(project.analysis);
    setGeneratedImages(project.images);
    setCurrentProjectId(project.id); // Set current ID so edits update this project
    setAppState(AppState.RESULTS);
  };

  const deleteProject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteProjectFromHistory(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error("Failed to delete project", err);
    }
  };

  const reset = () => {
    setAppState(AppState.UPLOAD);
    setJewelryFile(null);
    setJewelrySize('');
    setCurrentProjectId(null);
    setGeneratedImages([]);
    setAnalysis(null);
    setTryOnResult(null);
    setUserModelFile(null);
  };

  // --- RENDER HELPERS ---

  if (appState === AppState.API_KEY_SELECTION) {
    return (
      <div className="h-screen flex items-center justify-center bg-stone-50 p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-stone-100 text-center">
          <div className="mb-8">
             <MiOmorfiaLogo />
          </div>
          
          <p className="text-stone-500 mb-8">
            Professional Jewelry Photography Generation powered by Nano Banana (Flash) & Nano Banana Pro (Gemini 3 Pro).
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
    <div className="h-screen bg-stone-50 text-stone-900 font-sans flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 flex-shrink-0 h-16 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={reset}>
             <MiOmorfiaLogoSmall />
          </div>

          {/* Nav Actions */}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setAppState(AppState.TRY_ON)}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${appState === AppState.TRY_ON ? 'text-amber-600' : 'text-stone-600 hover:text-stone-900'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span className="hidden sm:inline">Virtual Try-On</span>
            </button>
            <div className="w-px h-6 bg-stone-300"></div>
            <button 
              onClick={loadHistory}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${appState === AppState.HISTORY ? 'text-amber-600' : 'text-stone-600 hover:text-stone-900'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span className="hidden sm:inline">History</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col w-full max-w-7xl mx-auto overflow-hidden">
        
        {/* Error Message */}
        {error && (
          <div className="flex-shrink-0 px-4 sm:px-6 lg:px-8 pt-4 z-20">
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg flex items-start gap-3 animate-pulse text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Upload View (Studio) */}
        {appState === AppState.UPLOAD && (
          <div className="flex-1 overflow-y-auto flex flex-col justify-center py-4 px-4 sm:px-6 lg:px-8 custom-scrollbar">
            <div className="max-w-3xl mx-auto animate-fade-in w-full min-h-[calc(100vh-8rem)] flex flex-col justify-center">
              <div className="text-center mb-4 md:mb-8">
                <h2 className="text-2xl md:text-4xl font-serif font-bold text-stone-900 mb-1 md:mb-2">Studio Quality Assets</h2>
                <p className="text-xs md:text-lg text-stone-600 leading-relaxed max-w-xl mx-auto hidden xs:block">
                  Upload your product photo. We'll utilize Nano Banana (Gemini Flash) & Nano Banana Pro (Gemini 3 Pro) to generate professional marketing assets instantly.
                </p>
              </div>

              <div className="bg-white p-4 md:p-8 rounded-2xl shadow-sm border border-stone-200">
                <div className="grid grid-cols-2 gap-3 md:gap-8 mb-4 md:mb-8">
                  <div className="col-span-1">
                    <FileUpload 
                      id="jewelry-upload"
                      label="1. Product" 
                      preview={jewelryFile} 
                      onChange={(_, base64) => setJewelryFile(base64)} 
                    />
                  </div>

                  <div className="col-span-1">
                     <FileUpload 
                      id="logo-upload"
                      label="2. Logo (Optional)" 
                      preview={logoFile} 
                      onChange={handleLogoChange} 
                    />
                  </div>
                  
                  <div className="col-span-2">
                     <div className="flex flex-col gap-1.5 md:gap-2">
                      <label htmlFor="size-input" className="text-xs md:text-sm font-medium text-stone-700 uppercase tracking-wide">
                        Approximate Size (Optional)
                      </label>
                      <input 
                        id="size-input"
                        type="text" 
                        placeholder="e.g. 2.5 cm, 18 inch chain" 
                        value={jewelrySize}
                        onChange={(e) => setJewelrySize(e.target.value)}
                        className="w-full p-2.5 md:p-3 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all placeholder-stone-400 bg-stone-50"
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={startGeneration}
                  disabled={!jewelryFile}
                  className={`w-full py-3 md:py-4 rounded-xl font-bold text-sm md:text-lg shadow-lg transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 ${
                    !jewelryFile
                      ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                      : 'bg-stone-900 text-white hover:bg-stone-800 hover:shadow-xl'
                  }`}
                >
                  <span>Generate Assets</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H5"/><path d="M21 16h-2"/><path d="M16 19h2"/></svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Virtual Try-On View */}
        {appState === AppState.TRY_ON && (
          <div className="flex-1 overflow-y-auto flex flex-col justify-center py-4 px-4 sm:px-6 lg:px-8 custom-scrollbar">
            <div className="max-w-4xl mx-auto animate-fade-in w-full min-h-[calc(100vh-8rem)]">
              <div className="text-center mb-8">
                <h2 className="text-2xl md:text-4xl font-serif font-bold text-stone-900 mb-2">Virtual Try-On</h2>
                <p className="text-stone-600">See how it looks instantly. Upload the jewelry and a photo of yourself.</p>
              </div>

              <div className="bg-white p-4 md:p-8 rounded-2xl shadow-sm border border-stone-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  {/* Inputs */}
                  <div className="flex flex-col gap-6">
                    <FileUpload 
                      id="jewelry-tryon-upload"
                      label="1. Jewelry Item" 
                      preview={jewelryFile} 
                      onChange={(_, base64) => setJewelryFile(base64)}
                      onCropClick={() => initiateCrop('jewelry')}
                    />
                    <FileUpload 
                      id="user-tryon-upload"
                      label="2. Your Photo" 
                      preview={userModelFile} 
                      onChange={(_, base64) => setUserModelFile(base64)}
                      onCropClick={() => initiateCrop('model')}
                    />
                    
                    <button
                      onClick={handleTryOnGeneration}
                      disabled={!jewelryFile || !userModelFile || isTryOnLoading}
                      className={`w-full py-3 rounded-xl font-bold text-sm md:text-lg shadow-lg transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 mt-auto ${
                        !jewelryFile || !userModelFile || isTryOnLoading
                          ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                          : 'bg-stone-900 text-white hover:bg-stone-800 hover:shadow-xl'
                      }`}
                    >
                      {isTryOnLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <span>Visualize It</span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Output */}
                  <div className="h-full min-h-[300px] bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-center relative overflow-hidden">
                    {tryOnResult ? (
                      <>
                        <img src={tryOnResult} alt="Try-On Result" className="w-full h-full object-contain" />
                        <div className="absolute bottom-4 right-4 flex gap-2">
                           <button 
                             onClick={() => handleDownload(tryOnResult, 'miomorfia-tryon.png')}
                             className="bg-white text-stone-900 px-4 py-2 rounded-full text-sm font-semibold shadow-lg hover:bg-stone-100 flex items-center gap-2"
                           >
                             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                             Download
                           </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-6 text-stone-400">
                        {isTryOnLoading ? (
                          <div className="flex flex-col items-center">
                             <div className="w-12 h-12 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin mb-4"></div>
                             <p>Fitting jewelry...</p>
                          </div>
                        ) : (
                          <>
                             <svg className="w-16 h-16 mx-auto mb-3 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                             <p>Result will appear here</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analyzing View */}
        {appState === AppState.ANALYZING && (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
             <div className="w-12 h-12 md:w-16 md:h-16 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin mx-auto mb-6"></div>
             <h3 className="text-xl md:text-2xl font-serif font-bold text-stone-900 mb-2">Analyzing your jewelry...</h3>
             <p className="text-sm md:text-base text-stone-500">identifying materials, style, and category to tailor the perfect photoshoot.</p>
          </div>
        )}

        {/* Results View */}
        {appState === AppState.RESULTS && (
          <div className="flex flex-col h-full px-4 sm:px-6 lg:px-8 py-6 animate-fade-in overflow-hidden">
             {/* Fixed Header */}
             <div className="flex-shrink-0 mb-6 z-10">
               <div className="bg-white p-4 md:p-6 rounded-xl border border-stone-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
                 <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-xl md:text-2xl font-serif font-bold text-stone-900">Production Gallery</h2>
                    </div>
                    
                    {analysis && (
                      <div className="flex flex-wrap gap-2 text-xs md:text-sm">
                        <span className="px-2 md:px-3 py-1 bg-amber-50 text-amber-800 rounded-full border border-amber-100 font-medium">
                          {analysis.category}
                        </span>
                        <span className="px-2 md:px-3 py-1 bg-stone-50 text-stone-600 rounded-full border border-stone-100">
                          {analysis.style}
                        </span>
                        {jewelrySize && (
                          <span className="px-2 md:px-3 py-1 bg-stone-50 text-stone-600 rounded-full border border-stone-100">
                            Size: {jewelrySize}
                          </span>
                        )}
                      </div>
                    )}
                 </div>

                 <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                   <button onClick={reset} className="justify-center px-4 py-2.5 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-100 border border-stone-200 transition-colors flex items-center">
                     New Project
                   </button>
                   
                   {generatedImages.some(img => img.status === 'completed') && (
                      <button 
                        onClick={handleDownloadAll}
                        className="justify-center px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download All
                      </button>
                   )}
                 </div>
               </div>
             </div>

             {/* Scrollable Grid */}
             <div className="flex-1 overflow-y-auto min-h-0 pb-6 pr-1 custom-scrollbar">
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                 {generatedImages.map((img) => (
                   <ScenarioCard 
                    key={img.id} 
                    item={img} 
                    onDownload={handleDownload} 
                    onEdit={handleEditImage}
                  />
                 ))}
               </div>
             </div>
          </div>
        )}

        {/* History View */}
        {appState === AppState.HISTORY && (
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 animate-fade-in custom-scrollbar">
            <div className="flex items-center justify-between mb-6 md:mb-8">
              <h2 className="text-2xl md:text-3xl font-serif font-bold text-stone-900">Project History</h2>
              <button onClick={reset} className="px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-medium hover:bg-stone-800 transition-colors">
                + New
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-xl border border-dashed border-stone-300">
                <div className="w-12 h-12 bg-stone-100 text-stone-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <p className="text-stone-500">No projects saved yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {projects.map(project => (
                  <div 
                    key={project.id} 
                    onClick={() => restoreProject(project)}
                    className="group bg-white rounded-xl border border-stone-200 overflow-hidden cursor-pointer hover:shadow-lg transition-all hover:border-amber-300"
                  >
                    <div className="relative h-40 md:h-48 bg-stone-100">
                      <img src={project.jewelryFile} alt="Project Source" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                      <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded text-xs font-medium text-stone-700 shadow-sm backdrop-blur-sm">
                        {new Date(project.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="p-3 md:p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-serif font-bold text-base md:text-lg text-stone-900 group-hover:text-amber-700 transition-colors truncate max-w-[150px]">
                            {project.analysis?.category || 'Jewelry'}
                          </h3>
                          <p className="text-xs text-stone-500 truncate">{project.analysis?.style || 'Style Analysis'}</p>
                        </div>
                        <button 
                          onClick={(e) => deleteProject(e, project.id)}
                          className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                          title="Delete Project"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-[10px] md:text-xs text-stone-500">
                        <span className="bg-stone-100 px-2 py-1 rounded-full">{project.images.length} Assets</span>
                        {project.jewelrySize && (
                           <span className="bg-stone-100 px-2 py-1 rounded-full text-stone-600">{project.jewelrySize}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Global Crop Modal */}
      {cropModalOpen && imageToCrop && (
        <CropModal 
          isOpen={cropModalOpen}
          imageSrc={imageToCrop}
          onClose={() => {
            setCropModalOpen(false);
            setImageToCrop(null);
          }}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  );
};

export default App;