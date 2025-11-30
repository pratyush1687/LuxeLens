import React, { useState } from 'react';
import { GeneratedImage } from '../types';

interface ScenarioCardProps {
  item: GeneratedImage;
  onDownload: (url: string, name: string) => void;
  onEdit: (id: string, prompt: string) => void;
}

const ScenarioCard: React.FC<ScenarioCardProps> = ({ item, onDownload, onEdit }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');

  const handleEditSubmit = () => {
    if (editPrompt.trim()) {
      onEdit(item.id, editPrompt);
      setIsEditing(false);
      setEditPrompt('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSubmit();
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-100 overflow-hidden group flex flex-col">
      <div className="relative aspect-square bg-stone-100 flex items-center justify-center overflow-hidden">
        {item.status === 'pending' && (
          <div className="flex flex-col items-center gap-3">
             <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
             <p className="text-xs text-stone-500 font-medium uppercase tracking-wider animate-pulse">Generating...</p>
          </div>
        )}
        
        {item.status === 'failed' && (
           <div className="text-center p-4">
             <span className="text-2xl mb-2 block">⚠️</span>
             <p className="text-xs text-red-500">Generation Failed</p>
           </div>
        )}

        {item.status === 'completed' && (
          <>
            <img 
              src={item.url} 
              alt={item.scenario} 
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
            />
            
            {/* Overlay Actions */}
            <div className={`absolute inset-0 bg-black/30 transition-opacity duration-300 flex items-center justify-center gap-2 ${isEditing ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}>
               <button 
                 onClick={() => onDownload(item.url, `miomorfia-${item.scenario.replace(/\s+/g, '-').toLowerCase()}.png`)}
                 className="bg-white text-stone-900 px-4 py-2 rounded-full text-xs md:text-sm font-semibold shadow-lg hover:bg-stone-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300"
               >
                 Download
               </button>
               <button 
                 onClick={() => setIsEditing(true)}
                 className="bg-stone-900 text-white px-4 py-2 rounded-full text-xs md:text-sm font-semibold shadow-lg hover:bg-stone-800 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 delay-75"
               >
                 Edit
               </button>
            </div>
          </>
        )}
      </div>

      <div className="p-3 border-t border-stone-100 flex-grow flex flex-col">
        <div className="flex justify-between items-start mb-1">
          <h4 className="text-sm font-semibold text-stone-800 truncate flex-1" title={item.scenario}>{item.scenario}</h4>
          {item.status === 'completed' && (
             <button 
              onClick={() => setIsEditing(!isEditing)}
              className={`text-xs font-medium px-2 py-0.5 rounded transition-colors ${isEditing ? 'bg-amber-100 text-amber-700' : 'text-stone-400 hover:text-stone-600'}`}
             >
               {isEditing ? 'Cancel' : 'Refine'}
             </button>
          )}
        </div>
        
        {/* Status or Edit Input */}
        {isEditing ? (
          <div className="mt-2 animate-fade-in">
            <div className="relative group">
              <input 
                type="text" 
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="E.g. Make it darker, add sparkle..." 
                className="w-full text-xs py-2.5 pl-3 pr-9 border border-stone-200 rounded-lg bg-white text-stone-900 placeholder-stone-400 focus:border-stone-400 focus:ring-1 focus:ring-amber-500 outline-none shadow-sm transition-all"
                autoFocus
              />
              <button 
                onClick={handleEditSubmit}
                disabled={!editPrompt.trim()}
                className="absolute right-1.5 top-1.5 p-1 bg-stone-900 text-white rounded hover:bg-amber-600 disabled:opacity-0 disabled:pointer-events-none transition-all duration-200 shadow-sm"
                title="Generate Edit"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-stone-500 mt-1 capitalize">{item.status}</p>
        )}
      </div>
    </div>
  );
};

export default ScenarioCard;