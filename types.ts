export enum AppState {
  API_KEY_SELECTION = 'API_KEY_SELECTION',
  UPLOAD = 'UPLOAD',
  ANALYZING = 'ANALYZING',
  GENERATING = 'GENERATING',
  RESULTS = 'RESULTS',
  HISTORY = 'HISTORY',
}

export interface JewelryAnalysis {
  category: 'Ring' | 'Earring' | 'Necklace' | 'Bracelet' | 'Bangle' | 'Pendant' | 'Other';
  style: 'Indian Traditional' | 'Western Modern' | 'Minimalist' | 'Vintage' | 'Bohemian' | 'Other';
  description: string;
  recommendedAttire: 'Indian Traditional' | 'Western Formal' | 'Western Casual' | 'Evening Gown';
}

export interface GeneratedImage {
  id: string;
  url: string;
  scenario: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface GenerationConfig {
  jewelryImage: string; // Base64
  logoImage: string; // Base64
}

export interface Project {
  id: string;
  timestamp: number;
  jewelryFile: string;
  logoFile: string;
  jewelrySize?: string;
  analysis: JewelryAnalysis;
  images: GeneratedImage[];
}