"use client";

import { useState, useEffect, useRef } from "react";
import { Download, Play, Pause, Image as ImageIcon, Video, Music, File } from "lucide-react";
import { apiGetMediaUrl } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type MessageMediaProps = {
  accessToken: string;
  messageId: string;
  messageType: string;
  bodyJson: any;
};

export default function MessageMedia({ accessToken, messageId, messageType, bodyJson }: MessageMediaProps) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLightbox, setShowLightbox] = useState(false);

  // Audio Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleSpeed = () => {
    const rates = [1, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    setProgress((time / duration) * 100);
    if (audioRef.current) audioRef.current.currentTime = time;
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    let alive = true;
    if (messageType === "image" || messageType === "audio" || messageType === "document" || messageType === "video") {
      (async () => {
        try {
          let mediaId = bodyJson?.media_asset_id;

          // Se não temos o ID direto no JSON, tentamos buscar no banco pelo messageId
          if (!mediaId) {
            const { data: media, error: mediaErr } = await supabaseBrowser()
              .from("media_assets")
              .select("id")
              .eq("message_id", messageId)
              .maybeSingle();
            
            if (mediaErr) throw mediaErr;
            if (media) mediaId = media.id;
          }

          if (!mediaId) {
            if (alive) {
              setError("Mídia não encontrada");
              setLoading(false);
            }
            return;
          }

          // Obter signed URL
          const urlData = await apiGetMediaUrl({ accessToken, mediaId });
          if (!alive) return;
          
          // Se o arquivo não existir (404), não mostrar erro
          if (!urlData) {
            setError("Arquivo de mídia não disponível");
            return;
          }
          
          setMediaUrl(urlData.url);
        } catch (err: any) {
          if (alive) {
            // Ignorar erros de "media_not_found" para não poluir console
            if (err.message !== 'media_not_found' && !err.message?.includes('media_not_found')) {
               console.error("Erro ao carregar mídia:", err);
            }
            setError(err.message ?? "Erro ao carregar mídia");
          }
        } finally {
          if (alive) setLoading(false);
        }
      })();
    } else {
      setLoading(false);
    }
    return () => {
      alive = false;
    };
  }, [accessToken, messageId, messageType, bodyJson]);

  const handleDownload = async () => {
    if (!mediaUrl) return;
    try {
      const response = await fetch(mediaUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fileName = bodyJson?.filename ?? bodyJson?.caption ?? `media_${messageId}.${messageType === "image" ? "jpg" : messageType === "video" ? "mp4" : messageType === "audio" ? "mp3" : "bin"}`;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Erro ao baixar mídia:", err);
    }
  };

  if (messageType === "image") {
    if (loading) return <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Carregando imagem...</div>;
    if (error || !mediaUrl) return <div className="text-xs text-gray-500 dark:text-gray-400">Imagem não disponível</div>;

    return (
      <>
        <div className="relative group mb-2">
          <img
            src={mediaUrl}
            alt="Imagem"
            className="max-w-full max-h-96 rounded-lg cursor-pointer hover:opacity-90 transition-opacity block object-cover"
            style={{ maxWidth: '400px', maxHeight: '400px', width: 'auto', height: 'auto' }}
            onClick={() => setShowLightbox(true)}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            className="absolute top-2 right-2 p-2 bg-black/70 hover:bg-black/90 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
            title="Baixar imagem"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
        {showLightbox && (
          <div
            className="fixed inset-0 bg-black/95 dark:bg-black/98 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            onClick={() => setShowLightbox(false)}
          >
            <div className="relative max-h-full max-w-full z-[10000]">
              <img src={mediaUrl} alt="Imagem" className="max-h-full max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload();
                }}
                className="absolute top-4 right-4 p-3 bg-black/70 hover:bg-black/90 text-white rounded-lg shadow-lg z-[10001]"
                title="Baixar imagem"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (messageType === "audio") {
    if (loading) return <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2"><Music className="w-4 h-4" /> Carregando áudio...</div>;
    if (error || !mediaUrl) return <div className="text-xs text-gray-500 dark:text-gray-400">Áudio não disponível</div>;

    return (
      <div className="flex items-center gap-3 p-2 rounded-xl bg-gray-100 dark:bg-gray-800 min-w-[260px] max-w-[320px] shadow-sm border border-gray-200 dark:border-gray-700">
        <audio 
          ref={audioRef} 
          src={mediaUrl} 
          onTimeUpdate={(e) => {
             setCurrentTime(e.currentTarget.currentTime);
             setProgress((e.currentTarget.currentTime / e.currentTarget.duration) * 100);
          }}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
        
        <button 
          onClick={togglePlay} 
          className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex-shrink-0"
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>
        
        <div className="flex-1 flex flex-col justify-center min-w-0 gap-1">
           <input 
             type="range" 
             min={0} 
             max={duration || 100} 
             value={currentTime} 
             onChange={handleSeek}
             className="w-full h-1 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
           />
           <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 font-medium">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
           </div>
        </div>

        <button 
          onClick={toggleSpeed} 
          className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-[10px] font-bold text-gray-700 dark:text-gray-300 transition-colors"
        >
          {playbackRate}x
        </button>
        
        <button 
          onClick={handleDownload} 
          className="p-1.5 text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors"
          title="Baixar áudio"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (messageType === "video") {
    if (loading) return <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2"><Video className="w-4 h-4" /> Carregando vídeo...</div>;
    if (error || !mediaUrl) return <div className="text-xs text-gray-500 dark:text-gray-400">Vídeo não disponível</div>;

    const fileName = bodyJson?.filename ?? bodyJson?.caption ?? `video_${messageId}.mp4`;

    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
        <div className="relative group mb-2">
          <video
            src={mediaUrl}
            controls
            className="w-full max-h-96 rounded-lg"
            preload="metadata"
          />
          <button
            onClick={handleDownload}
            className="absolute top-2 right-2 p-2 bg-black/70 hover:bg-black/90 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
            title="Baixar vídeo"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
        {fileName && (
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <Video className="w-4 h-4" />
              <span className="truncate">{fileName}</span>
            </div>
            {bodyJson?.file_size && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {Math.round(bodyJson.file_size / 1024)} KB
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (messageType === "document") {
    if (loading) return <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2"><File className="w-4 h-4" /> Carregando documento...</div>;
    const fileName = bodyJson?.filename ?? bodyJson?.caption ?? "Documento";
    const fileSize = bodyJson?.file_size ? `${Math.round(bodyJson.file_size / 1024)} KB` : "";

    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
        <div className="flex items-center gap-3">
          <File className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-gray-900 dark:text-white">{fileName}</div>
            {fileSize && <div className="text-xs text-gray-500 dark:text-gray-400">{fileSize}</div>}
          </div>
          {mediaUrl && (
            <button
              onClick={handleDownload}
              className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-sm flex-shrink-0"
              title="Baixar documento"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (messageType === "location") {
    const latitude = bodyJson?.latitude;
    const longitude = bodyJson?.longitude;
    const address = bodyJson?.address ?? bodyJson?.name ?? "";

    if (!latitude || !longitude) {
      return <div className="text-xs text-gray-500 dark:text-gray-400">Localização não disponível</div>;
    }

    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.01},${latitude - 0.01},${longitude + 0.01},${latitude + 0.01}&layer=mapnik&marker=${latitude},${longitude}`;
    const mapLink = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=15`;

    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
        {address && <div className="text-sm mb-2 text-gray-900 dark:text-white">{address}</div>}
        <iframe width="100%" height="200" frameBorder="0" scrolling="no" src={mapUrl} className="rounded" />
        <a
          href={mapLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline mt-2 block transition-colors"
        >
          Abrir no mapa →
        </a>
      </div>
    );
  }

  return null;
}

