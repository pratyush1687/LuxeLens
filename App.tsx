import React, { useState, useEffect, useCallback } from 'react';
import { AppState, JewelryAnalysis, GeneratedImage, Project } from './types';
import FileUpload from './components/FileUpload';
import ScenarioCard from './components/ScenarioCard';
import { analyzeJewelryImage, generateJewelryRendition, editGeneratedImage } from './services/geminiService';
import { saveProjectToHistory, getProjectHistory, deleteProjectFromHistory, savePreferredLogo, getPreferredLogo } from './services/dbService';

const App: React.FC = () => {
  // State
  const [appState, setAppState] = useState<AppState>(AppState.API_KEY_SELECTION);
  const [jewelryFile, setJewelryFile] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<string | null>(null);
  const [jewelrySize, setJewelrySize] = useState<string>('');
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
        const generatedUrl = await generateJewelryRendition(jFile, lFile, analysisData, prompt, sizeStr);

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
      handleDownload(img.url, `luxelens-${img.scenario.replace(/\s+/g, '-').toLowerCase()}.png`);
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
  };

  // --- RENDER HELPERS ---

  if (appState === AppState.API_KEY_SELECTION) {
    return (
      <div className="h-screen flex items-center justify-center bg-stone-50 p-6">
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
    <div className="h-screen bg-stone-50 text-stone-900 font-sans flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 flex-shrink-0 h-16 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={reset}>
             <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center text-white shadow-sm">
               <span className="font-serif font-bold text-lg">L</span>
             </div>
             <span className="font-serif font-bold text-lg md:text-xl tracking-tight text-stone-900">LuxeLens</span>
          </div>

          {/* Nav Actions */}
          <div className="flex items-center gap-4">
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

        {/* Upload View */}
        {appState === AppState.UPLOAD && (
          <div className="flex-1 overflow-y-auto flex flex-col justify-center py-4 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto animate-fade-in w-full">
              <div className="text-center mb-4 md:mb-8">
                <h2 className="text-2xl md:text-4xl font-serif font-bold text-stone-900 mb-1 md:mb-2">Studio Quality Assets</h2>
                <p className="text-xs md:text-lg text-stone-600 leading-relaxed max-w-xl mx-auto hidden xs:block">
                  Upload your product photo. We'll utilize Nano Banana Pro to generate professional marketing assets instantly.
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
                      <span className="hidden md:inline-block px-2 py-0.5 bg-stone-900 text-stone-50 text-xs font-semibold rounded uppercase tracking-wider">Nano Banana Pro</span>
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
    </div>
  );
};

export default App;