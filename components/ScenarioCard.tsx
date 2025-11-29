import React from 'react';
import { GeneratedImage } from '../types';

interface ScenarioCardProps {
  item: GeneratedImage;
  onDownload: (url: string, name: string) => void;
}

const ScenarioCard: React.FC<ScenarioCardProps> = ({ item, onDownload }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-100 overflow-hidden group">
      <div className="relative aspect-square bg-stone-100 flex items-center justify-center">
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
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
               <button 
                 onClick={() => onDownload(item.url, `luxelens-${item.scenario.replace(/\s+/g, '-').toLowerCase()}.png`)}
                 className="bg-white text-stone-900 px-4 py-2 rounded-full text-sm font-semibold shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-all"
               >
                 Download
               </button>
            </div>
          </>
        )}
      </div>
      <div className="p-3 border-t border-stone-100">
        <h4 className="text-sm font-semibold text-stone-800 truncate" title={item.scenario}>{item.scenario}</h4>
        <p className="text-xs text-stone-500 mt-1 capitalize">{item.status}</p>
      </div>
    </div>
  );
};

export default ScenarioCard;
