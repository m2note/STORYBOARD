
export type StyleTheme = 'Real' | 'Style 2D' | 'Style 3D';
export type AspectRatio = '9:16' | '16:9';

export interface CharacterImage {
  file: File;
  base64: string;
}

export interface FormData {
  title: string;
  description: string;
  style: StyleTheme;
  aspectRatio: AspectRatio;
  character1?: CharacterImage;
  character2?: CharacterImage;
}

export interface Clip {
  clip: number;
  narration: string;
  prompt: string;
  image: string; // base64 data URL
  audio: string; // base64 data string
}

export interface Scene {
  scene: number;
  clips: Clip[];
}

export type Storyboard = Scene[];

export interface StoryboardStructureClip {
    clip: number;
    narration: string;
    prompt: string;
}

export interface StoryboardStructureScene {
    scene: number;
    clips: StoryboardStructureClip[];
}

export type StoryboardStructure = StoryboardStructureScene[];
