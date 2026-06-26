export interface RenderInput {
  text: string;
}

export interface RenderOutput {
  text: string;
  fallbackUsed: boolean;
  provider: 'sarvam' | 'gemini';
}
