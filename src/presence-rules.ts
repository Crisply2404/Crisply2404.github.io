export const speechRange = 240;
export const speechDuration = 8000;
export const speechCharacterLimit = 120;
export const speechSendInterval = 500;

export interface SpeechMessage {
  id: string;
  text: string;
  expiresAt: number;
}
