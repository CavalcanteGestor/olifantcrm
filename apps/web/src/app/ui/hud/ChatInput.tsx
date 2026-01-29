"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Mic, Paperclip, Smile, X, StopCircle, Play, Trash2, FileText, Image as ImageIcon, Video, File } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { useTheme } from "@/contexts/ThemeContext";

type ChatInputProps = {
  onSendText: (text: string) => void;
  onSendAudio: (blob: Blob) => void;
  onSendFile: (file: File, caption?: string) => void;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  allowAudio?: boolean;
  allowAttachments?: boolean;
  isAdminMode?: boolean;
  adminReplyMode?: boolean;
  onEnableAdminReply?: () => void;
};

export default function ChatInput({
  onSendText,
  onSendAudio,
  onSendFile,
  onTyping,
  disabled = false,
  placeholder = "Digite uma mensagem...",
  allowAudio = true,
  allowAttachments = true,
  isAdminMode = false,
  adminReplyMode = false,
  onEnableAdminReply
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileCaption, setFileCaption] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { theme } = useTheme();

  // Resetar estado quando desabilitado
  useEffect(() => {
    if (disabled) {
      setShowEmoji(false);
      setShowAttachMenu(false);
      if (isRecording) stopRecording();
    }
  }, [disabled]);

  // Timer de gravação
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSendText(text);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Tentar usar codecs que geram arquivos menores e mais compatíveis
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus";
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType }); // Usar o mesmo mimeType da gravação
        // Para WhatsApp PTT, o ideal seria converter para OGG/Opus no backend se o browser gerar WebM
        onSendAudio(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setAudioChunks([]);
      setIsRecording(true);
    } catch (err) {
      console.error("Erro ao iniciar gravação:", err);
      alert("Não foi possível acessar o microfone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop(); // Para parar a stream
      setIsRecording(false);
      setMediaRecorder(null);
      setAudioChunks([]); // Descarta os chunks
      // Importante: não chamar onSendAudio
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setText((prev) => prev + emojiData.emoji);
    // Não fechar o picker para permitir múltiplos emojis
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFileCaption("");
      setShowAttachMenu(false);
    }
    e.target.value = "";
  };

  const sendFile = () => {
    if (selectedFile) {
      onSendFile(selectedFile, fileCaption);
      setSelectedFile(null);
      setFileCaption("");
    }
  };

  // Renderização condicional para Admin bloqueado
  if (isAdminMode && !adminReplyMode) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex items-center justify-center">
        <button
          onClick={onEnableAdminReply}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-semibold shadow-lg transition-all transform hover:scale-105"
        >
          <Send className="w-4 h-4" />
          <span>Ativar Modo de Resposta</span>
        </button>
      </div>
    );
  }

  // Modal de preview de arquivo
  if (selectedFile) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
        <div className="flex flex-col gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">Enviar Arquivo</h3>
            <button onClick={() => setSelectedFile(null)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
              {selectedFile.type.startsWith("image/") ? <ImageIcon className="w-6 h-6" /> :
               selectedFile.type.startsWith("video/") ? <Video className="w-6 h-6" /> :
               <FileText className="w-6 h-6" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{selectedFile.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={fileCaption}
              onChange={(e) => setFileCaption(e.target.value)}
              placeholder="Adicionar legenda..."
              className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && sendFile()}
            />
            <button
              onClick={sendFile}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition-colors"
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
      {/* Emoji Picker Popover */}
      {showEmoji && (
        <div className="absolute bottom-full left-0 mb-2 z-50">
          <div className="relative">
            <button 
              onClick={() => setShowEmoji(false)} 
              className="absolute -top-2 -right-2 p-1 bg-white dark:bg-gray-800 rounded-full shadow-md border border-gray-200 dark:border-gray-700 z-10"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
            <EmojiPicker
              onEmojiClick={onEmojiClick}
              theme={theme === "dark" ? Theme.DARK : Theme.LIGHT}
              width={300}
              height={400}
              lazyLoadEmojis={true}
            />
          </div>
        </div>
      )}

      {/* Menu de Anexo */}
      {showAttachMenu && (
        <div className="absolute bottom-full left-12 mb-2 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-2 flex flex-col gap-1 min-w-[160px] animate-in slide-in-from-bottom-2 fade-in duration-200">
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg text-sm text-gray-700 dark:text-gray-200 transition-colors w-full text-left">
            <ImageIcon className="w-4 h-4 text-purple-500" />
            <span>Fotos e Vídeos</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg text-sm text-gray-700 dark:text-gray-200 transition-colors w-full text-left">
            <FileText className="w-4 h-4 text-blue-500" />
            <span>Documento</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
            multiple={false}
          />
        </div>
      )}

      {isRecording ? (
        <div className="flex items-center gap-4 animate-in fade-in duration-200">
          <div className="flex-1 flex items-center gap-3 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-xl border border-red-100 dark:border-red-900/30">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
            <span className="font-mono text-red-600 dark:text-red-400 font-medium min-w-[50px]">
              {formatTime(recordingTime)}
            </span>
            <div className="flex-1 h-1 bg-red-200 dark:bg-red-900/50 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 animate-[width_2s_ease-in-out_infinite]" style={{ width: '100%' }} />
            </div>
          </div>
          
          <button
            onClick={cancelRecording}
            className="p-3 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
            title="Cancelar"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          
          <button
            onClick={stopRecording}
            className="p-3 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-md transition-transform hover:scale-105 flex items-center gap-2"
            title="Enviar Áudio"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          {/* Botões de Mídia */}
          <div className="flex gap-1 pb-1">
            <button
              onClick={() => setShowEmoji(!showEmoji)}
              className={`p-2.5 rounded-full transition-colors ${showEmoji ? "text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
              disabled={disabled}
            >
              <Smile className="w-5 h-5" />
            </button>
            {allowAttachments && (
              <button
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                className={`p-2.5 rounded-full transition-colors ${showAttachMenu ? "text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                disabled={disabled}
              >
                <Paperclip className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Input de Texto */}
          <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 focus-within:border-indigo-500 dark:focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
            <TextareaAutosize
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                onTyping?.(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              minRows={1}
              maxRows={6}
              disabled={disabled}
              className="w-full bg-transparent px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none"
            />
          </div>

          {/* Botão de Enviar ou Gravar */}
          <div className="pb-1">
            {text.trim() ? (
              <button
                onClick={handleSend}
                disabled={disabled}
                className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-md transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            ) : allowAudio ? (
              <button
                onClick={startRecording}
                disabled={disabled}
                className="p-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full transition-colors disabled:opacity-50"
                title="Gravar áudio"
              >
                <Mic className="w-5 h-5" />
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
