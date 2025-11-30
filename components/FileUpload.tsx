import React, { ChangeEvent } from 'react';

interface FileUploadProps {
  label: string;
  accept?: string;
  onChange: (file: File | null, preview: string | null) => void;
  preview: string | null;
  id: string;
  onCropClick?: () => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ label, accept = "image/*", onChange, preview, id, onCropClick }) => {
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onChange(file, reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      onChange(null, null);
    }
  };

  return (
    <div className="flex flex-col gap-2 h-full">
      <label className="text-xs md:text-sm font-medium text-stone-700 uppercase tracking-wide truncate">{label}</label>
      <div className={`relative flex-grow min-h-[8rem] md:min-h-[13rem] border-2 border-dashed rounded-lg transition-all duration-300 ${preview ? 'border-stone-300 bg-stone-50' : 'border-stone-300 hover:border-amber-500 hover:bg-stone-50'}`}>
        {preview ? (
          <div className="relative w-full h-full p-2 group flex items-center justify-center">
            <img src={preview} alt="Preview" className="max-w-full max-h-full object-contain rounded shadow-sm" />
            <div className="absolute top-2 left-2 bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full opacity-80">
              Loaded
            </div>
            
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onCropClick && (
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    onCropClick();
                  }}
                  className="bg-white text-stone-700 p-1.5 rounded-full shadow-md hover:text-amber-600 transition-colors"
                  title="Crop image"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/><path d="M4 5l7 7m0-7l-7 7"/></svg>
                </button>
              )}
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  onChange(null, null);
                }}
                className="bg-red-500 text-white p-1.5 rounded-full shadow-md hover:bg-red-600 transition-colors"
                title="Remove image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
        ) : (
          <label htmlFor={id} className="flex flex-col items-center justify-center w-full h-full cursor-pointer p-2 text-center">
            <div className="flex flex-col items-center justify-center">
              <svg className="w-6 h-6 md:w-10 md:h-10 mb-2 md:mb-3 text-stone-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
              </svg>
              <p className="mb-1 text-[10px] md:text-sm text-stone-500"><span className="font-semibold">Upload</span></p>
            </div>
            <input id={id} type="file" className="hidden" accept={accept} onChange={handleFileChange} />
          </label>
        )}
      </div>
    </div>
  );
};

export default FileUpload;