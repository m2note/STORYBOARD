
import React, { useState, useCallback, FC } from 'react';
import type { FormData, StyleTheme, AspectRatio, CharacterImage, Storyboard, Clip } from './types';
import { generateStoryboard, playAudio, stopAudio } from './services/geminiService';
import { SparklesIcon, UploadCloudIcon, CopyIcon, DownloadIcon, PlayCircleIcon, PauseCircleIcon, RefreshCwIcon } from './components/icons';

// UTILITY FUNCTIONS
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // remove 'data:*/*;base64,' prefix
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};


// --- UI COMPONENTS ---

interface FileUploadProps {
  label: string;
  onFileSelect: (image: CharacterImage | undefined) => void;
}

const FileUpload: FC<FileUploadProps> = ({ label, onFileSelect }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if(file.size > 10 * 1024 * 1024) {
        alert("Ukuran file maksimal 10MB");
        return;
      }
      try {
        const base64 = await fileToBase64(file);
        const objectUrl = URL.createObjectURL(file);
        setPreview(objectUrl);
        setFileName(file.name);
        onFileSelect({ file, base64 });
      } catch (error) {
        console.error("Error converting file to base64", error);
        alert("Gagal memproses gambar.");
      }
    }
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-300 mb-2">{label}</label>
      <div className="relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-600 rounded-lg bg-gray-800/50 hover:border-purple-400 transition-colors duration-300">
        {preview ? (
          <>
            <img src={preview} alt="Preview" className="object-contain h-full w-full rounded-lg p-1" />
            <div className="absolute bottom-1 right-1 bg-black/50 text-white text-xs px-2 py-1 rounded">
              {fileName}
            </div>
          </>
        ) : (
          <div className="text-center text-gray-500">
            <UploadCloudIcon className="mx-auto h-10 w-10 mb-2" />
            <p>Klik atau seret & lepaskan untuk unggah</p>
            <p className="text-xs">PNG, JPG, GIF hingga 10MB</p>
          </div>
        )}
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          accept="image/png, image/jpeg, image/gif"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
};

interface LoaderProps {
  progressMessage: string;
}
const Loader: FC<LoaderProps> = ({ progressMessage }) => (
  <div className="fixed inset-0 bg-black/70 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
    <div className="text-center">
      <div className="w-16 h-16 border-4 border-t-purple-500 border-gray-600 rounded-full animate-spin mb-4"></div>
      <h2 className="text-2xl font-bold text-white mb-2">Cerita Sedang Dibuat...</h2>
      <p className="text-gray-300">{progressMessage}</p>
    </div>
  </div>
);

interface StoryFormProps {
  onSubmit: (data: FormData) => void;
  isLoading: boolean;
}

const StoryForm: FC<StoryFormProps> = ({ onSubmit, isLoading }) => {
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    style: 'Real',
    aspectRatio: '9:16',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.description) {
      alert("Judul Cerita dan Deskripsi Singkat wajib diisi.");
      return;
    }
    onSubmit(formData);
  };

  const handleStyleChange = (style: StyleTheme) => {
    setFormData(prev => ({ ...prev, style }));
  };
  
  const handleAspectRatioChange = (ratio: AspectRatio) => {
    setFormData(prev => ({ ...prev, aspectRatio: ratio }));
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-6">
      <div>
        <label htmlFor="title" className="block text-sm font-bold text-gray-300 mb-1">Judul Cerita</label>
        <input
          id="title"
          type="text"
          value={formData.title}
          onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
          placeholder="Contoh: Petualangan di Hutan Kristal"
          className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
          required
        />
      </div>
      <div>
        <label htmlFor="description" className="block text-sm font-bold text-gray-300 mb-1">Deskripsi Singkat</label>
        <textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
          rows={3}
          placeholder="Contoh: Seorang ksatria pemberani dan sahabat naganya mencari artefak kuno untuk menyelamatkan kerajaan mereka."
          className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">Style Theme</label>
        <div className="flex gap-2">
          {(['Real', 'Style 2D', 'Style 3D'] as StyleTheme[]).map(style => (
            <button
              type="button"
              key={style}
              onClick={() => handleStyleChange(style)}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition ${formData.style === style ? 'bg-purple-600 text-white shadow-lg' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              {style}
            </button>
          ))}
        </div>
      </div>
      
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">Pilih Aspek Rasio</label>
        <div className="flex gap-2">
            {(['9:16', '16:9'] as AspectRatio[]).map(ratio => (
              <button
                type="button"
                key={ratio}
                onClick={() => handleAspectRatioChange(ratio)}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition ${formData.aspectRatio === ratio ? 'bg-yellow-500 text-black shadow-lg' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                {ratio === '9:16' ? 'Portrait (9:16)' : 'Landscape (16:9)'}
              </button>
            ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FileUpload label="Gambar Pemeran Utama" onFileSelect={(img) => setFormData(p => ({ ...p, character1: img }))} />
        <FileUpload label="Gambar Pemeran Kedua (Opsional)" onFileSelect={(img) => setFormData(p => ({ ...p, character2: img }))} />
      </div>

      <button type="submit" disabled={isLoading} className="w-full font-bold text-lg text-white py-3 px-6 rounded-lg bg-gradient-to-r from-pink-500 to-yellow-500 hover:from-pink-600 hover:to-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 shadow-lg">
        {isLoading ? 'Membuat...' : 'Buat Alur Cerita'}
      </button>
    </form>
  );
};

const ClipCard: FC<{ clip: Clip, sceneNumber: number, onPlay: (audio: string, clipId: string) => void, isPlaying: boolean }> = ({ clip, sceneNumber, onPlay, isPlaying }) => {
    const [copied, setCopied] = useState(false);
    const clipId = `scene-${sceneNumber}-clip-${clip.clip}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(clip.prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-gray-800/50 p-3 rounded-lg flex flex-col gap-3">
             <div className="relative group">
                <img src={clip.image} alt={`Scene ${sceneNumber} Clip ${clip.clip}`} className="w-full rounded-md aspect-[9/16] object-cover" />
                <div className="absolute top-2 right-2">
                    <button onClick={() => downloadDataUrl(clip.image, `adegan_${sceneNumber}_klip_${clip.clip}.png`)} className="p-1.5 bg-black/50 rounded-full text-white hover:bg-purple-600 transition-colors">
                        <DownloadIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>
            <div>
                <div className="flex justify-between items-center mb-1">
                    <h4 className="text-xs font-semibold text-yellow-400">Prompt Video #{clip.clip}</h4>
                    <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
                        <CopyIcon /> {copied ? 'Disalin!' : 'Salin'}
                    </button>
                </div>
                <p className="text-xs text-gray-400 bg-gray-900/50 p-2 rounded-md font-mono">{clip.prompt}</p>
            </div>
            <div>
                <h4 className="text-xs font-semibold text-yellow-400 mb-1">Narasi #{clip.clip}</h4>
                <div className="flex items-center gap-2 bg-gray-900/50 p-2 rounded-md">
                    <button onClick={() => isPlaying ? stopAudio() : onPlay(clip.audio, clipId)} className="text-yellow-400 hover:text-yellow-300">
                        {isPlaying ? <PauseCircleIcon /> : <PlayCircleIcon />}
                    </button>
                    <p className="text-sm text-gray-300 flex-1">{clip.narration}</p>
                    <button onClick={() => downloadDataUrl(`data:audio/wav;base64,${clip.audio}`, `narasi_${sceneNumber}_${clip.clip}.wav`)} className="text-gray-400 hover:text-white">
                        <DownloadIcon />
                    </button>
                </div>
            </div>
        </div>
    );
};


interface StoryboardDisplayProps {
  storyboard: Storyboard;
  onReset: () => void;
}

const StoryboardDisplay: FC<StoryboardDisplayProps> = ({ storyboard, onReset }) => {
    const [playingClipId, setPlayingClipId] = useState<string | null>(null);

    const handlePlayAudio = (audioBase64: string, clipId: string) => {
        playAudio(audioBase64, () => setPlayingClipId(null));
        setPlayingClipId(clipId);
    };

    React.useEffect(() => {
        return () => {
            stopAudio(); // Cleanup on unmount
        };
    }, []);

  return (
    <div className="w-full max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-white">Hasil Storyboard Anda</h2>
            <button onClick={onReset} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
                <RefreshCwIcon className="w-5 h-5" /> Buat Baru
            </button>
        </div>
      <div className="space-y-8">
        {storyboard.map((scene) => (
          <div key={scene.scene} className="bg-gray-900/70 border border-gray-700 rounded-xl p-4 backdrop-blur-sm">
            <div className="bg-yellow-400 text-black font-bold py-1 px-3 mb-4 rounded-md inline-block">
              Adegan #{scene.scene}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {scene.clips.map(clip => (
                    <ClipCard 
                        key={clip.clip} 
                        clip={clip} 
                        sceneNumber={scene.scene}
                        onPlay={handlePlayAudio}
                        isPlaying={playingClipId === `scene-${scene.scene}-clip-${clip.clip}`}
                    />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


// --- MAIN APP COMPONENT ---

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);

  const handleGenerate = useCallback(async (data: FormData) => {
    setIsLoading(true);
    setError(null);
    setStoryboard(null);
    try {
      const result = await generateStoryboard(data, setProgressMessage);
      setStoryboard(result);
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan yang tidak diketahui.';
      setError(`Gagal membuat storyboard: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setProgressMessage('');
    }
  }, []);
  
  const handleReset = () => {
      setStoryboard(null);
      setError(null);
      setIsLoading(false);
  }

  return (
    <div className="min-h-screen bg-transparent text-white p-4 sm:p-6 lg:p-8">
      {isLoading && <Loader progressMessage={progressMessage}/>}
      <main className="max-w-7xl mx-auto">
        <header className="text-center my-8">
            <div className="inline-flex items-center gap-3 border border-purple-500/50 rounded-full py-2 px-6">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
                    THIS IS MY KISAH!
                </h1>
                <SparklesIcon className="w-8 h-8 text-yellow-400" />
            </div>
        </header>

        <div className="bg-gray-900/50 border border-gray-700/50 rounded-2xl shadow-2xl shadow-purple-900/10 p-6 md:p-10 backdrop-blur-md">
            {error && (
              <div className="bg-red-500/20 border border-red-500 text-red-300 p-4 rounded-lg mb-6 text-center">
                <p>{error}</p>
                <button onClick={() => setError(null)} className="mt-2 underline">Coba lagi</button>
              </div>
            )}
            
            {!storyboard && (
                <StoryForm onSubmit={handleGenerate} isLoading={isLoading} />
            )}

            {storyboard && !isLoading && (
                <StoryboardDisplay storyboard={storyboard} onReset={handleReset} />
            )}
        </div>
        <footer className="text-center text-gray-500 text-sm py-8">
            Ditenagai oleh Gemini API
        </footer>
      </main>
    </div>
  );
}

export default App;
