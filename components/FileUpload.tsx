import React, { ChangeEvent } from 'react';

interface FileUploadProps {
  label: string;
  accept?: string;
  onChange: (file: File | null, preview: string | null) => void;
  preview: string | null;
  id: string;
}

const FileUpload: React.FC<FileUploadProps> = ({ label, accept = "image/*", onChange, preview, id }) => {
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
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-stone-700 uppercase tracking-wide">{label}</label>
      <div className={`relative flex items-center justify-center w-full h-48 border-2 border-dashed rounded-lg transition-all duration-300 ${preview ? 'border-stone-300 bg-stone-50' : 'border-stone-300 hover:border-amber-500 hover:bg-stone-50'}`}>
        {preview ? (
          <div className="relative w-full h-full p-2 group">
            <img src={preview} alt="Preview" className="w-full h-full object-contain rounded" />
            <button 
              onClick={(e) => {
                e.preventDefault();
                onChange(null, null);
              }}
              className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        ) : (
          <label htmlFor={id} className="flex flex-col items-center justify-center w-full h-full cursor-pointer">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <svg className="w-8 h-8 mb-4 text-stone-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
              </svg>
              <p className="mb-2 text-sm text-stone-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
              <p className="text-xs text-stone-400">PNG, JPG (MAX. 5MB)</p>
            </div>
            <input id={id} type="file" className="hidden" accept={accept} onChange={handleFileChange} />
          </label>
        )}
      </div>
    </div>
  );
};

export default FileUpload;